import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { isPostgresUniqueViolation } from "@/db/errors";
import { conversationCases, conversations, messages } from "@/modules/conversations/schema";
import { contacts } from "@/modules/contacts/schema";
import { getCase } from "@/modules/cases/service";
import { getMessagingAccount } from "@/modules/messaging/service";
import { getMessagingAdapter } from "@/modules/messaging/registry";
import { recordActivity } from "@/modules/audit/service";
import type { MessagingAccountRecord } from "@/modules/messaging/adapter";

export async function listConversations(organizationId: string) {
  return db.select().from(conversations).where(eq(conversations.organizationId, organizationId));
}

export async function getConversation(organizationId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.id, conversationId)))
    .limit(1);
  return row ?? null;
}

export async function listMessages(organizationId: string, conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(and(eq(messages.organizationId, organizationId), eq(messages.conversationId, conversationId)))
    .orderBy(asc(messages.createdAt));
}

export async function linkConversationToCase(organizationId: string, conversationId: string, caseId: string) {
  const conversation = await getConversation(organizationId, conversationId);
  if (!conversation) {
    throw new Error("Conversation not found in this organization.");
  }
  const relatedCase = await getCase(organizationId, caseId);
  if (!relatedCase) {
    throw new Error("Case not found in this organization.");
  }

  await db.insert(conversationCases).values({ conversationId, caseId }).onConflictDoNothing();
}

interface InboundContactInfo {
  externalContactId: string;
  displayName?: string | null;
  phoneE164?: string | null;
}

/**
 * Finds the Conversation for a `(messagingAccountId, externalConversationId)`
 * pair, creating both it and a minimal Contact when this is the first
 * message ever seen from that external chat — "un mensaje de un Contact
 * desconocido no se pierde" (docs/PRODUCT.md sección 4). No fuzzy matching
 * against existing Contacts by phone/name: duplicate detection/merging is
 * explicitly deferred (docs/DECISIONS.md, same as PKG-002). The Contact name
 * is never fabricated — it's the provider's display name, or failing that
 * the phone, or failing that the raw external id.
 *
 * Contact + Conversation are created in one transaction so that losing a
 * race against a concurrent webhook for the same brand-new conversation
 * (two events arriving back to back before either commits) rolls back
 * cleanly instead of leaving an orphaned Contact — same pattern as
 * bootstrapOrganizationForUser (docs/DECISIONS.md, "Fix: login
 * silencioso...").
 */
export async function findOrCreateConversation(
  organizationId: string,
  account: MessagingAccountRecord,
  externalConversationId: string,
  contact: InboundContactInfo,
) {
  const existing = await selectConversationByExternalId(account.id, externalConversationId);
  if (existing) {
    return existing;
  }

  try {
    return await db.transaction(async (tx) => {
      const contactName = contact.displayName || contact.phoneE164 || contact.externalContactId;
      const [insertedContact] = await tx
        .insert(contacts)
        .values({
          organizationId,
          name: contactName,
          phoneE164: contact.phoneE164 || null,
        })
        .returning();

      const [insertedConversation] = await tx
        .insert(conversations)
        .values({
          organizationId,
          messagingAccountId: account.id,
          contactId: insertedContact.id,
          channel: account.channel,
          externalConversationId,
        })
        .returning();

      return insertedConversation;
    });
  } catch (error) {
    if (isPostgresUniqueViolation(error)) {
      const winner = await selectConversationByExternalId(account.id, externalConversationId);
      if (winner) {
        return winner;
      }
    }
    throw error;
  }
}

async function selectConversationByExternalId(messagingAccountId: string, externalConversationId: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.messagingAccountId, messagingAccountId),
        eq(conversations.externalConversationId, externalConversationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

interface InsertInboundMessageInput {
  organizationId: string;
  conversation: typeof conversations.$inferSelect;
  account: MessagingAccountRecord;
  externalMessageId: string;
  body: string;
  sourceWebhookEventId: string;
  occurredAt: Date;
}

/**
 * `onConflictDoNothing` on `(messaging_account_id, external_message_id)` is
 * the idempotency guarantee: a webhook delivered twice for the same message
 * never creates a second row (docs/ARCHITECTURE.md sección 7). Returns
 * `{ created: false }` on a duplicate so the caller knows not to log
 * MESSAGE_RECEIVED again.
 */
export async function insertInboundMessage(input: InsertInboundMessageInput) {
  const [inserted] = await db
    .insert(messages)
    .values({
      organizationId: input.organizationId,
      conversationId: input.conversation.id,
      messagingAccountId: input.account.id,
      externalMessageId: input.externalMessageId,
      direction: "INBOUND",
      body: input.body,
      deliveryStatus: "DELIVERED",
      sourceWebhookEventId: input.sourceWebhookEventId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    })
    .onConflictDoNothing({ target: [messages.messagingAccountId, messages.externalMessageId] })
    .returning();

  if (inserted) {
    return { created: true as const, message: inserted };
  }
  return { created: false as const, message: null };
}

/** Applies a delivery-status callback to the matching (already-sent) Message — never creates a new row. */
export async function applyDeliveryUpdate(
  messagingAccountId: string,
  externalMessageId: string,
  deliveryStatus: "SENT" | "DELIVERED" | "READ" | "FAILED",
) {
  await db
    .update(messages)
    .set({ deliveryStatus, updatedAt: new Date() })
    .where(
      and(eq(messages.messagingAccountId, messagingAccountId), eq(messages.externalMessageId, externalMessageId)),
    );
}

export interface SendOutboundMessageInput {
  organizationId: string;
  actorUserId: string;
  conversationId: string;
  text: string;
}

export async function sendOutboundMessage(input: SendOutboundMessageInput) {
  const conversation = await getConversation(input.organizationId, input.conversationId);
  if (!conversation) {
    throw new Error("Conversation not found in this organization.");
  }

  const account = await getMessagingAccount(input.organizationId, conversation.messagingAccountId);
  if (!account) {
    throw new Error("MessagingAccount not found in this organization.");
  }

  const adapter = getMessagingAdapter(conversation.channel);
  if (!adapter) {
    throw new Error(`No MessagingAdapter registered for channel "${conversation.channel}".`);
  }

  const result = await adapter.sendMessage(account, conversation, { text: input.text });

  const [message] = await db
    .insert(messages)
    .values({
      organizationId: input.organizationId,
      conversationId: conversation.id,
      messagingAccountId: account.id,
      externalMessageId: result.externalMessageId,
      direction: "OUTBOUND",
      body: input.text,
      deliveryStatus: result.deliveryStatus === "FAILED" ? "FAILED" : "SENT",
    })
    .onConflictDoNothing({ target: [messages.messagingAccountId, messages.externalMessageId] })
    .returning();

  const sentMessage =
    message ??
    (await db
      .select()
      .from(messages)
      .where(and(eq(messages.messagingAccountId, account.id), eq(messages.externalMessageId, result.externalMessageId)))
      .limit(1)
      .then((rows) => rows[0]));

  await recordActivity({
    organizationId: input.organizationId,
    type: "MESSAGE_SENT",
    actorUserId: input.actorUserId,
    entityType: "conversation",
    entityId: conversation.id,
    metadata: { messageId: sentMessage.id },
  });

  return sentMessage;
}
