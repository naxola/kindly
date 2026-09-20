import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { isPostgresUniqueViolation } from "@/db/errors";
import { conversationCases, conversations, messages } from "@/modules/conversations/schema";
import { isConversationUnread } from "@/modules/conversations/domain";
import { contacts } from "@/modules/contacts/schema";
import { messagingAccounts } from "@/modules/messaging/schema";
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
          isUnassigned: true,
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

interface InsertEchoedMessageInput {
  organizationId: string;
  conversation: typeof conversations.$inferSelect;
  account: MessagingAccountRecord;
  externalMessageId: string;
  body: string;
  sourceWebhookEventId: string;
  occurredAt: Date;
}

/**
 * Persists a message the delegate sent from their own device, echoed back
 * by the provider (WhatsApp coexistence `smb_message_echoes`, PKG-005).
 *
 * Idempotency is the same `(messaging_account_id, external_message_id)`
 * constraint used by every other path, and here it does double duty: it
 * absorbs a redelivered webhook *and* the case that matters most for this
 * channel — a message Kindly itself sent coming straight back as an echo.
 * Either way `created: false`, so no duplicate row and no second Activity.
 */
export async function insertEchoedMessage(input: InsertEchoedMessageInput) {
  const [inserted] = await db
    .insert(messages)
    .values({
      organizationId: input.organizationId,
      conversationId: input.conversation.id,
      messagingAccountId: input.account.id,
      externalMessageId: input.externalMessageId,
      direction: "OUTBOUND",
      sentFromDevice: true,
      body: input.body,
      // The provider only echoes messages it already accepted, so SENT is
      // the floor; real delivery/read callbacks arrive separately.
      deliveryStatus: "SENT",
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

  // `onConflictDoUpdate`, not `DoNothing`: on a channel that echoes outbound
  // messages back (coexistence), the provider's echo can land before this
  // insert commits and would then own the row, mislabelled as written on the
  // delegate's phone. Whoever told us first, a message that went through
  // `sendOutboundMessage` was composed in Kindly — so correct just that flag
  // and nothing else. `deliveryStatus` in particular is left alone: a
  // DELIVERED/READ callback may already have overtaken us.
  const [message] = await db
    .insert(messages)
    .values({
      organizationId: input.organizationId,
      conversationId: conversation.id,
      messagingAccountId: account.id,
      externalMessageId: result.externalMessageId,
      direction: "OUTBOUND",
      sentFromDevice: false,
      body: input.text,
      deliveryStatus: result.deliveryStatus === "FAILED" ? "FAILED" : "SENT",
    })
    .onConflictDoUpdate({
      target: [messages.messagingAccountId, messages.externalMessageId],
      set: { sentFromDevice: false, updatedAt: new Date() },
    })
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

export interface ConversationPreview {
  id: string;
  contactId: string;
  contactName: string;
  contactIsUnassigned: boolean;
  channel: string;
  delegateId: string;
  lastMessage: { body: string; direction: "INBOUND" | "OUTBOUND"; createdAt: Date } | null;
  unread: boolean;
}

export interface ListConversationsFilters {
  channel?: string;
  unreadOnly?: boolean;
}

/**
 * Inbox listing (PKG-004): every Conversation of the organization with its
 * Contact, channel, delegate and last message, newest activity first — a
 * Conversation's own `updatedAt` never changes when a Message arrives, so
 * ordering by the last message's `createdAt` (not the Conversation row) is
 * what actually reflects "most recently active".
 */
export async function listConversationsWithPreview(
  organizationId: string,
  filters: ListConversationsFilters = {},
): Promise<ConversationPreview[]> {
  const rows = await db
    .select({
      conversation: conversations,
      contactName: contacts.name,
      contactIsUnassigned: contacts.isUnassigned,
      delegateId: messagingAccounts.delegateId,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(messagingAccounts, eq(messagingAccounts.id, conversations.messagingAccountId))
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        filters.channel ? eq(conversations.channel, filters.channel) : undefined,
      ),
    );

  const conversationIds = rows.map((row) => row.conversation.id);
  const lastMessagesByConversation = new Map<string, (typeof messages.$inferSelect)>();
  if (conversationIds.length > 0) {
    const recentMessages = await db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, conversationIds))
      .orderBy(desc(messages.createdAt));
    for (const message of recentMessages) {
      if (!lastMessagesByConversation.has(message.conversationId)) {
        lastMessagesByConversation.set(message.conversationId, message);
      }
    }
  }

  const previews = rows.map((row): ConversationPreview => {
    const lastMessage = lastMessagesByConversation.get(row.conversation.id) ?? null;
    return {
      id: row.conversation.id,
      contactId: row.conversation.contactId,
      contactName: row.contactName,
      contactIsUnassigned: row.contactIsUnassigned,
      channel: row.conversation.channel,
      delegateId: row.delegateId,
      lastMessage: lastMessage
        ? { body: lastMessage.body, direction: lastMessage.direction, createdAt: lastMessage.createdAt }
        : null,
      unread: isConversationUnread(lastMessage?.createdAt ?? null, row.conversation.lastReadAt),
    };
  });

  const filtered = filters.unreadOnly ? previews.filter((preview) => preview.unread) : previews;
  return filtered.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt.getTime() ?? 0;
    const bTime = b.lastMessage?.createdAt.getTime() ?? 0;
    return bTime - aTime;
  });
}

export interface ConversationDetails {
  conversation: typeof conversations.$inferSelect;
  contact: typeof contacts.$inferSelect;
  delegateId: string;
}

/** Conversation detail view (PKG-004): the Conversation plus its Contact and owning delegate, scoped to `organizationId`. */
export async function getConversationWithDetails(
  organizationId: string,
  conversationId: string,
): Promise<ConversationDetails | null> {
  const [row] = await db
    .select({
      conversation: conversations,
      contact: contacts,
      delegateId: messagingAccounts.delegateId,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(messagingAccounts, eq(messagingAccounts.id, conversations.messagingAccountId))
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.id, conversationId)))
    .limit(1);
  return row ?? null;
}

/**
 * Marks a Conversation as read (PKG-004). Called from the detail page on
 * every view — intentionally mutates during a GET, but that route is
 * already fully dynamic (reads the session) and never cached, and "opening
 * it marks it read" is the entire point of this call.
 */
export async function markConversationRead(organizationId: string, conversationId: string): Promise<void> {
  await db
    .update(conversations)
    .set({ lastReadAt: new Date() })
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.id, conversationId)));
}

/**
 * Moves a Conversation to a different, already-existing Contact of the same
 * organization — the "Reasignar" action for a Contact marked `Unassigned`
 * (docs/PRODUCT.md sección 4: "...asignarlo"). Does not merge or delete the
 * original minimal Contact (fusión/eliminación real siguen fuera de
 * alcance, ver project/CURRENT_TASK.md Non-goals) — it's simply left
 * without any Conversation pointing at it.
 */
export async function reassignConversationContact(
  organizationId: string,
  actorUserId: string,
  conversationId: string,
  targetContactId: string,
) {
  const conversation = await getConversation(organizationId, conversationId);
  if (!conversation) {
    throw new Error("Conversation not found in this organization.");
  }

  const [targetContact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, targetContactId)))
    .limit(1);
  if (!targetContact) {
    throw new Error("Target contact not found in this organization.");
  }

  const previousContactId = conversation.contactId;

  const [updated] = await db
    .update(conversations)
    .set({ contactId: targetContactId, updatedAt: new Date() })
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.id, conversationId)))
    .returning();

  await recordActivity({
    organizationId,
    type: "CONVERSATION_REASSIGNED",
    actorUserId,
    entityType: "conversation",
    entityId: conversationId,
    metadata: { from: previousContactId, to: targetContactId },
  });

  return updated ?? null;
}
