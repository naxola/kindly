import "server-only";
import { and, asc, count, desc, eq, exists, gt, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { isPostgresUniqueViolation } from "@/db/errors";
import { conversationCases, conversations, messages, type MessageDeliveryStatus } from "@/modules/conversations/schema";
import {
  getServiceWindowState,
  isConversationUnread,
  shouldApplyDeliveryStatus,
  type ServiceWindowState,
} from "@/modules/conversations/domain";
import { contactAssignments, contacts } from "@/modules/contacts/schema";
import { contactVisibilityCondition, type VisibilityMember } from "@/modules/contacts/visibility";
import { messagingAccounts } from "@/modules/messaging/schema";
import { getCase } from "@/modules/cases/service";
import { getMessagingAccount } from "@/modules/messaging/service";
import { getMessagingAdapter } from "@/modules/messaging/registry";
import { recordActivity } from "@/modules/audit/service";
import type { MessagingAccountRecord } from "@/modules/messaging/adapter";

export async function listConversations(organizationId: string) {
  return db.select().from(conversations).where(eq(conversations.organizationId, organizationId));
}

/**
 * Distinct channels with at least one Conversation, for the Inbox's channel
 * filter (UI-5). Deliberately independent of the current view/search/
 * delegate filters — narrowing it to "channels visible in the current
 * view" would make the dropdown shrink as you filter, hiding the very
 * option that would show the rest again.
 */
export async function listConversationChannels(organizationId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ channel: conversations.channel })
    .from(conversations)
    .where(eq(conversations.organizationId, organizationId))
    .orderBy(asc(conversations.channel));
  return rows.map((row) => row.channel);
}

/**
 * Unread count for the sidebar badge (UI-2, docs/ui/LAYOUT_NAVIGATION.md
 * §3). Through PKG-004 this was organization-wide, matching a shared Inbox;
 * PKG-014 gives a DELEGATE their own restricted Inbox, so this now takes
 * the same `member` scoping (an ADMIN still sees everyone's, unchanged).
 * Counts conversations rather than messages, and does the "unread" check
 * in SQL with the same rule as `isConversationUnread` instead of loading
 * every message, since this runs on every authenticated page render.
 */
export async function countUnreadConversations(organizationId: string, member: VisibilityMember): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        contactVisibilityCondition(organizationId, member, conversations.contactId),
        exists(
          db
            .select({ one: messages.id })
            .from(messages)
            .where(
              and(
                eq(messages.conversationId, conversations.id),
                or(isNull(conversations.lastReadAt), gt(messages.createdAt, conversations.lastReadAt)),
              ),
            ),
        ),
      ),
    );
  return row?.value ?? 0;
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
  // A Case always belongs to exactly one Contact (`cases.contactId NOT
  // NULL`) — linking a Conversation from a different Contact has no product
  // meaning (Fase 6, docs/PRODUCT.md sección 7) and nothing else checks it.
  if (relatedCase.contactId !== conversation.contactId) {
    throw new Error("Cannot link a Conversation to a Case of a different Contact.");
  }

  await db.insert(conversationCases).values({ conversationId, caseId }).onConflictDoNothing();
}

/** Conversations linked to a Case (Fase 6), most recently linked first. */
export async function listLinkedConversations(organizationId: string, caseId: string) {
  return db
    .select({ conversation: conversations, linkedAt: conversationCases.createdAt })
    .from(conversationCases)
    .innerJoin(conversations, eq(conversations.id, conversationCases.conversationId))
    .where(and(eq(conversations.organizationId, organizationId), eq(conversationCases.caseId, caseId)))
    .orderBy(desc(conversationCases.createdAt));
}

/** Case ids a Conversation is linked to (Fase 6) — used by the Inbox ficha to mark cases already linked. */
export async function listCaseIdsLinkedToConversation(organizationId: string, conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ caseId: conversationCases.caseId })
    .from(conversationCases)
    .innerJoin(conversations, eq(conversations.id, conversationCases.conversationId))
    .where(and(eq(conversations.organizationId, organizationId), eq(conversationCases.conversationId, conversationId)));
  return rows.map((row) => row.caseId);
}

export async function unlinkConversationFromCase(organizationId: string, conversationId: string, caseId: string) {
  const conversation = await getConversation(organizationId, conversationId);
  if (!conversation) {
    throw new Error("Conversation not found in this organization.");
  }

  await db
    .delete(conversationCases)
    .where(and(eq(conversationCases.conversationId, conversationId), eq(conversationCases.caseId, caseId)));
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

      // PKG-014: a Contact created from an inbound message starts out
      // assigned to whichever delegate's account received it — the person
      // who is, right now, the only one who has ever heard from them.
      // `assignedBy: null`, same reasoning as MESSAGE_RECEIVED's
      // `actorUserId`: no human made this call.
      await tx.insert(contactAssignments).values({
        organizationId,
        contactId: insertedContact.id,
        delegateId: account.delegateId,
        assignedBy: null,
      });

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
  const where = and(eq(messages.messagingAccountId, messagingAccountId), eq(messages.externalMessageId, externalMessageId));
  const [current] = await db.select({ deliveryStatus: messages.deliveryStatus }).from(messages).where(where).limit(1);
  // Out-of-order callbacks must not move a status backwards (PKG-013).
  if (!current || !shouldApplyDeliveryStatus(current.deliveryStatus, deliveryStatus)) {
    return;
  }
  await db.update(messages).set({ deliveryStatus, updatedAt: new Date() }).where(where);
}

/**
 * Service-window state for a conversation (PKG-005), resolved against the
 * channel's declared capabilities rather than any provider name. An
 * unregistered channel has no adapter to ask — in that case the window is
 * reported as NOT_APPLICABLE, which is honest: we genuinely do not know,
 * and sending is already impossible without an adapter anyway.
 */
export async function getConversationServiceWindow(
  organizationId: string,
  conversationId: string,
  channel: string,
  now: Date = new Date(),
): Promise<ServiceWindowState> {
  const adapter = getMessagingAdapter(channel);
  if (!adapter) {
    return { status: "NOT_APPLICABLE", expiresAt: null };
  }

  const [lastInbound] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.conversationId, conversationId),
        eq(messages.direction, "INBOUND"),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);

  return getServiceWindowState(lastInbound?.createdAt ?? null, adapter.capabilities.serviceWindowHours, now);
}

interface ImportHistoryMessageInput {
  organizationId: string;
  conversation: typeof conversations.$inferSelect;
  account: MessagingAccountRecord;
  externalMessageId: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  sourceWebhookEventId: string;
  occurredAt: Date;
}

/**
 * Persists one replayed message from the provider's initial history sync
 * (PKG-005). Same idempotency key as every other path, so re-running an
 * import — which WhatsApp's phased history delivery makes likely — never
 * duplicates anything.
 *
 * An imported OUTBOUND message is always `sentFromDevice: true`: it
 * predates the connection, so by definition Kindly did not compose it.
 */
export async function importHistoryMessage(input: ImportHistoryMessageInput) {
  const [inserted] = await db
    .insert(messages)
    .values({
      organizationId: input.organizationId,
      conversationId: input.conversation.id,
      messagingAccountId: input.account.id,
      externalMessageId: input.externalMessageId,
      direction: input.direction,
      sentFromDevice: input.direction === "OUTBOUND",
      body: input.body,
      deliveryStatus: input.direction === "INBOUND" ? "DELIVERED" : "SENT",
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

/**
 * Marks a conversation as read up to `readAt` without touching anything
 * else — used after a history import so that importing 180 days of past
 * conversations does not land in the Inbox as a wall of unread threads
 * (docs/DECISIONS.md, PKG-005). Never moves `lastReadAt` backwards: a
 * conversation the user already opened stays where they left it, and a
 * later history phase cannot un-read it.
 */
export async function markConversationReadUpTo(
  organizationId: string,
  conversationId: string,
  readAt: Date,
): Promise<void> {
  const [conversation] = await db
    .select({ lastReadAt: conversations.lastReadAt })
    .from(conversations)
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.id, conversationId)))
    .limit(1);

  if (conversation && conversation.lastReadAt && conversation.lastReadAt.getTime() >= readAt.getTime()) {
    return;
  }

  await db
    .update(conversations)
    .set({ lastReadAt: readAt })
    .where(and(eq(conversations.organizationId, organizationId), eq(conversations.id, conversationId)));
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

  // PKG-014: a reply always goes out through the Conversation's own
  // MessagingAccount, i.e. through whichever delegate's WhatsApp/Telegram
  // it is connected to — never a shared org identity. Before this, nothing
  // stopped a different member from opening that account's Conversation
  // and sending as if they were its delegate. "Ana ve el historial de
  // Luis en solo lectura; si contesta, es siempre desde su propio número"
  // (docs/DECISIONS.md) only holds if this is enforced here, not just left
  // to the UI hiding the composer.
  if (account.delegateId !== input.actorUserId) {
    throw new Error("Solo el delegado dueño de este canal puede responder desde Kindly.");
  }

  const adapter = getMessagingAdapter(conversation.channel);
  if (!adapter) {
    throw new Error(`No MessagingAdapter registered for channel "${conversation.channel}".`);
  }

  // Defense in depth: the composer already hides itself when the window is
  // closed, but a closed window means the provider will reject the send
  // outright, so the domain refuses it too rather than recording a message
  // that never left.
  const serviceWindow = await getConversationServiceWindow(
    input.organizationId,
    conversation.id,
    conversation.channel,
  );
  if (serviceWindow.status === "CLOSED") {
    throw new Error("The provider's messaging window for this conversation is closed.");
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
  /**
   * The Contact's *current* reference delegate (PKG-014) — not necessarily
   * this Conversation's own `delegateId`: a Contact with more than one
   * delegate writing to them has one Conversation per delegate, and every
   * one of them carries the same `referenceDelegateId`. `null` only for a
   * pre-PKG-014 Contact that was never assigned (no Conversation at
   * migration time) and still has none.
   */
  referenceDelegateId: string | null;
  lastMessage: {
    body: string;
    direction: "INBOUND" | "OUTBOUND";
    createdAt: Date;
    deliveryStatus: MessageDeliveryStatus;
    sentFromDevice: boolean;
  } | null;
  unread: boolean;
}

/**
 * The Inbox's four views (docs/ui/INBOX.md §2), in "who needs attention"
 * order. `pending`: the Contact spoke last (docs/ui/INBOX.md §1, the
 * primary "needs attention" signal) — it is not `unread`, since a
 * conversation can be read but still awaiting a reply.
 */
export type InboxView = "pending" | "unread" | "unassigned" | "all";

export interface ListConversationsFilters {
  channel?: string;
  delegateId?: string;
  view?: InboxView;
  /** Matches contact name, contact phone, or the last message's text. */
  search?: string;
  /** Restricts to one Contact's Conversations — the ficha's "Otras conversaciones" (UI-10a). */
  contactId?: string;
}

/**
 * One `last_message` per Conversation via `LEFT JOIN LATERAL` — a fresh
 * `.as()` per call, since the same aliased subquery cannot be joined more
 * than once across the independent queries below (the list, and each of
 * the four view counts).
 */
function lastMessageLateralQuery() {
  return db
    .select({
      id: messages.id,
      body: messages.body,
      direction: messages.direction,
      createdAt: messages.createdAt,
      deliveryStatus: messages.deliveryStatus,
      sentFromDevice: messages.sentFromDevice,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversations.id))
    .orderBy(desc(messages.createdAt))
    .limit(1)
    .as("last_message");
}

/**
 * The condition that defines each view. `unread` additionally requires a
 * real last message (`isNotNull(lastMessage.id)`): without it, a
 * message-less Conversation with no `lastReadAt` would otherwise read as
 * "unread" by the bare "never read" rule.
 */
function inboxViewCondition(view: InboxView, lastMessage: ReturnType<typeof lastMessageLateralQuery>) {
  switch (view) {
    case "pending":
      return eq(lastMessage.direction, "INBOUND");
    case "unread":
      return and(
        isNotNull(lastMessage.id),
        or(isNull(conversations.lastReadAt), gt(lastMessage.createdAt, conversations.lastReadAt)),
      );
    case "unassigned":
      return eq(contacts.isUnassigned, true);
    case "all":
      return undefined;
  }
}

function inboxFilterConditions(
  organizationId: string,
  member: VisibilityMember,
  filters: Pick<ListConversationsFilters, "channel" | "delegateId" | "search" | "contactId">,
  lastMessage: ReturnType<typeof lastMessageLateralQuery>,
) {
  return and(
    eq(conversations.organizationId, organizationId),
    // PKG-014: a DELEGATE only sees a Conversation whose Contact they are
    // the reference delegate for, or currently have "acceso temporal" to —
    // an ADMIN gets `undefined` (no filter), same as everywhere else this
    // condition is used.
    contactVisibilityCondition(organizationId, member, conversations.contactId),
    filters.channel ? eq(conversations.channel, filters.channel) : undefined,
    filters.delegateId ? eq(messagingAccounts.delegateId, filters.delegateId) : undefined,
    filters.contactId ? eq(conversations.contactId, filters.contactId) : undefined,
    filters.search
      ? or(
          ilike(contacts.name, `%${filters.search}%`),
          ilike(contacts.phoneE164, `%${filters.search}%`),
          ilike(lastMessage.body, `%${filters.search}%`),
        )
      : undefined,
  );
}

/**
 * Inbox listing (PKG-004, rebuilt in UI-5 on a `LATERAL` join): every
 * Conversation of the organization with its Contact, channel, delegate and
 * last message, newest activity first. Replaces the original "load every
 * message of every conversation to find the newest one" query
 * (docs/ui/INBOX.md §1) — this fetches exactly one message row per
 * conversation, in the database, and does the view/search filtering and
 * the ordering in SQL instead of in JS.
 */
export async function listConversationsWithPreview(
  organizationId: string,
  member: VisibilityMember,
  filters: ListConversationsFilters = {},
): Promise<ConversationPreview[]> {
  const lastMessage = lastMessageLateralQuery();
  const rows = await db
    .select({
      conversation: conversations,
      contactName: contacts.name,
      contactIsUnassigned: contacts.isUnassigned,
      delegateId: messagingAccounts.delegateId,
      // The active assignment row, if any — `LEFT JOIN`, not inner: a
      // pre-PKG-014 Contact that was never assigned has none, and this must
      // not drop its Conversation from the list. Safe as a plain one-to-one
      // join (not a LATERAL) because the partial unique index guarantees at
      // most one row per Contact with `ended_at IS NULL`.
      referenceDelegateId: contactAssignments.delegateId,
      // Individual columns, not the whole `lastMessage` subquery as one
      // field: Drizzle only allows embedding a joined subquery as-is when
      // it selects exactly one column (its "scalar subquery" shape).
      lastMessageId: lastMessage.id,
      lastMessageBody: lastMessage.body,
      lastMessageDirection: lastMessage.direction,
      lastMessageCreatedAt: lastMessage.createdAt,
      lastMessageDeliveryStatus: lastMessage.deliveryStatus,
      lastMessageSentFromDevice: lastMessage.sentFromDevice,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(messagingAccounts, eq(messagingAccounts.id, conversations.messagingAccountId))
    .leftJoin(contactAssignments, and(eq(contactAssignments.contactId, contacts.id), isNull(contactAssignments.endedAt)))
    .leftJoinLateral(lastMessage, sql`true`)
    .where(
      and(
        inboxFilterConditions(organizationId, member, filters, lastMessage),
        inboxViewCondition(filters.view ?? "all", lastMessage),
      ),
    )
    // Newest activity first, inbound or outbound — a reply moves its
    // conversation to the top, same as a WhatsApp chat list. `coalesce`
    // with the conversation's own creation time: a bare `DESC` sorts NULLs
    // first in PostgreSQL, which would pin every message-less conversation
    // above all real activity.
    .orderBy(desc(sql`coalesce(${lastMessage.createdAt}, ${conversations.createdAt})`));

  return rows.map((row): ConversationPreview => ({
    id: row.conversation.id,
    contactId: row.conversation.contactId,
    contactName: row.contactName,
    contactIsUnassigned: row.contactIsUnassigned,
    channel: row.conversation.channel,
    delegateId: row.delegateId,
    referenceDelegateId: row.referenceDelegateId,
    lastMessage: row.lastMessageId
      ? {
          body: row.lastMessageBody!,
          direction: row.lastMessageDirection!,
          createdAt: row.lastMessageCreatedAt!,
          deliveryStatus: row.lastMessageDeliveryStatus!,
          sentFromDevice: row.lastMessageSentFromDevice!,
        }
      : null,
    unread: isConversationUnread(row.lastMessageCreatedAt, row.conversation.lastReadAt),
  }));
}

export type InboxViewCounts = Record<InboxView, number>;

/**
 * Counts for the Inbox's `ContextNav` badges (docs/ui/INBOX.md §2).
 * Answers "how many, ignoring the search box" — `channel`/`delegateId`
 * narrow which mailbox you're counting, same as the list; free-text
 * `search` does not, the same way Gmail's folder counts do not react to
 * whatever is currently typed in its search bar.
 */
export async function countConversationsByView(
  organizationId: string,
  member: VisibilityMember,
  filters: Pick<ListConversationsFilters, "channel" | "delegateId"> = {},
): Promise<InboxViewCounts> {
  const views: InboxView[] = ["pending", "unread", "unassigned", "all"];
  const entries = await Promise.all(
    views.map(async (view) => {
      const lastMessage = lastMessageLateralQuery();
      const [row] = await db
        .select({ value: count() })
        .from(conversations)
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .innerJoin(messagingAccounts, eq(messagingAccounts.id, conversations.messagingAccountId))
        .leftJoinLateral(lastMessage, sql`true`)
        .where(and(inboxFilterConditions(organizationId, member, filters, lastMessage), inboxViewCondition(view, lastMessage)));
      return [view, row?.value ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as InboxViewCounts;
}

export interface ConversationDetails {
  conversation: typeof conversations.$inferSelect;
  contact: typeof contacts.$inferSelect;
  delegateId: string;
  /** The Contact's current reference delegate (PKG-014) — see `ConversationPreview.referenceDelegateId`. */
  referenceDelegateId: string | null;
}

/**
 * Conversation detail view (PKG-004): the Conversation plus its Contact and
 * owning delegate, scoped to `organizationId` and, since PKG-014, to
 * `member`'s visibility — a DELEGATE gets `null` (same as "not found") for
 * a Conversation they are not the reference delegate for and have no
 * temporary access to, which `/inbox/[id]` already turns into `notFound()`.
 */
export async function getConversationWithDetails(
  organizationId: string,
  member: VisibilityMember,
  conversationId: string,
): Promise<ConversationDetails | null> {
  const [row] = await db
    .select({
      conversation: conversations,
      contact: contacts,
      delegateId: messagingAccounts.delegateId,
      referenceDelegateId: contactAssignments.delegateId,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(messagingAccounts, eq(messagingAccounts.id, conversations.messagingAccountId))
    .leftJoin(contactAssignments, and(eq(contactAssignments.contactId, contacts.id), isNull(contactAssignments.endedAt)))
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.id, conversationId),
        contactVisibilityCondition(organizationId, member, conversations.contactId),
      ),
    )
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

/**
 * What the conversation screen needs of a message, serializable so the
 * same shape serves the first render and every poll (PKG-013).
 */
export interface ThreadMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  deliveryStatus: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  sentFromDevice: boolean;
  createdAt: string;
}

export function toThreadMessage(message: typeof messages.$inferSelect): ThreadMessage {
  return {
    id: message.id,
    direction: message.direction,
    body: message.body,
    deliveryStatus: message.deliveryStatus,
    sentFromDevice: message.sentFromDevice,
    createdAt: message.createdAt.toISOString(),
  };
}

export interface ConversationThreadState {
  messages: ThreadMessage[];
  serviceWindow: { status: ServiceWindowState["status"]; expiresAt: string | null };
}

/**
 * The live part of a conversation — its messages and whether the reply
 * window is open — for the first render and for the screen's polling
 * (PKG-013). Having it open is what "read" means (PKG-004), so every poll
 * that sees new inbound messages keeps the conversation read.
 *
 * Visibility-checked (PKG-014), not just organization-scoped: this backs
 * the poll endpoint the open conversation screen hits every few seconds
 * independently of the page load that first checked access, so it has to
 * re-check on every call rather than trust that a visible page got here.
 */
export async function getConversationThreadState(
  organizationId: string,
  member: VisibilityMember,
  conversationId: string,
  // `false` for a prefetch (the Inbox loads a conversation on hover so it
  // opens instantly) — hovering a row must not mark it read.
  { markRead = true }: { markRead?: boolean } = {},
): Promise<ConversationThreadState | null> {
  const details = await getConversationWithDetails(organizationId, member, conversationId);
  if (!details) {
    return null;
  }
  const conversation = details.conversation;
  if (markRead) {
    await markConversationRead(organizationId, conversationId);
  }
  const [rows, serviceWindow] = await Promise.all([
    listMessages(organizationId, conversationId),
    getConversationServiceWindow(organizationId, conversationId, conversation.channel),
  ]);
  return {
    messages: rows.map(toThreadMessage),
    serviceWindow: { status: serviceWindow.status, expiresAt: serviceWindow.expiresAt?.toISOString() ?? null },
  };
}

/** Whether the conversation's channel can show "typing…" to the Contact (PKG-013). */
export function channelSupportsTypingIndicator(channel: string): boolean {
  return typeof getMessagingAdapter(channel)?.sendTypingIndicator === "function";
}

/**
 * Shows "typing…" to the Contact while a member composes a reply
 * (PKG-013). On WhatsApp the same call marks the Contact's latest message
 * as read — they see the blue double tick — which the user accepted
 * explicitly (docs/DECISIONS.md, 2026-09-25). Best effort: a failure here
 * must never get in the way of writing the reply, so it is logged, not
 * thrown.
 */
export async function signalTyping(organizationId: string, conversationId: string): Promise<void> {
  const conversation = await getConversation(organizationId, conversationId);
  if (!conversation) {
    throw new Error("Conversation not found in this organization.");
  }
  const adapter = getMessagingAdapter(conversation.channel);
  if (!adapter?.sendTypingIndicator) {
    return;
  }
  // Outside the window the provider would reject it, and there is no reply
  // on its way anyway: the composer is hidden.
  const serviceWindow = await getConversationServiceWindow(organizationId, conversationId, conversation.channel);
  if (serviceWindow.status === "CLOSED") {
    return;
  }
  const account = await getMessagingAccount(organizationId, conversation.messagingAccountId);
  const [lastInbound] = await db
    .select({ externalMessageId: messages.externalMessageId })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.conversationId, conversationId),
        eq(messages.direction, "INBOUND"),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!account || !lastInbound) {
    return;
  }
  try {
    await adapter.sendTypingIndicator(account, conversation, lastInbound.externalMessageId);
  } catch (error) {
    console.warn(`[typing] ${conversation.channel}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

