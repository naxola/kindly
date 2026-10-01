import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { webhookEvents } from "@/modules/messaging/schema";
import { getMessagingAccountByChannelAndId, applyProviderDisconnection } from "@/modules/messaging/service";
import { getMessagingAdapter } from "@/modules/messaging/registry";
import {
  findOrCreateConversation,
  insertInboundMessage,
  insertEchoedMessage,
  importHistoryMessage,
  markConversationReadUpTo,
  applyDeliveryUpdate,
} from "@/modules/conversations/service";
import { recordActivity } from "@/modules/audit/service";
import type { MessagingAdapter, MessagingAccountRecord } from "@/modules/messaging/adapter";

export type WebhookOutcome =
  | { status: 404 }
  | { status: 401 }
  | { status: 200; webhookEventId: string; process: () => Promise<void> };

/**
 * Pipeline order follows docs/ARCHITECTURE.md sección 7 exactly: validate
 * signature → persist raw event → (caller responds 200) → async normalize.
 * An invalid signature is rejected *before* anything is persisted — no
 * record of a forged/misattributed request is kept.
 *
 * The `process` callback is separate from this function so the route
 * handler can schedule it with Next.js `after()` (runs once the response
 * has been sent) instead of blocking the webhook response on normalization
 * work — see docs/DECISIONS.md for why this isn't a pg-boss/Inngest job
 * yet.
 */
export async function receiveWebhook(
  channel: string,
  accountId: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<WebhookOutcome> {
  const adapter = getMessagingAdapter(channel);
  if (!adapter) {
    return { status: 404 };
  }

  const account = await getMessagingAccountByChannelAndId(channel, accountId);
  if (!account) {
    return { status: 404 };
  }

  if (!adapter.verifyWebhookSignature(rawBody, headers, account)) {
    return { status: 401 };
  }

  const [event] = await db
    .insert(webhookEvents)
    .values({
      organizationId: account.organizationId,
      messagingAccountId: account.id,
      channel,
      rawBody,
      headers,
    })
    .returning();

  return {
    status: 200,
    webhookEventId: event.id,
    process: () => processWebhookEvent(event.id, adapter, account),
  };
}

/**
 * The `GET` side of the webhook route: a provider's subscription handshake
 * (PKG-011). Nothing is persisted — it is not an event, just proof that
 * whoever registered the URL knows the verify token.
 */
export async function verifyWebhookSubscription(
  channel: string,
  accountId: string,
  query: URLSearchParams,
): Promise<{ status: 404 } | { status: 403 } | { status: 200; body: string }> {
  const adapter = getMessagingAdapter(channel);
  if (!adapter?.verifyWebhookChallenge) {
    return { status: 404 };
  }

  const account = await getMessagingAccountByChannelAndId(channel, accountId);
  if (!account) {
    return { status: 404 };
  }

  const body = adapter.verifyWebhookChallenge(query);
  return body === null ? { status: 403 } : { status: 200, body };
}

async function processWebhookEvent(
  webhookEventId: string,
  adapter: MessagingAdapter,
  account: MessagingAccountRecord,
): Promise<void> {
  try {
    const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, webhookEventId)).limit(1);
    if (!event) {
      return;
    }

    const parsedEvents = adapter.parseWebhookEvents(event.rawBody, event.headers as Record<string, string>);

    for (const normalized of parsedEvents) {
      if (normalized.kind === "MESSAGE") {
        const conversation = await findOrCreateConversation(account.organizationId, account, normalized.externalConversationId, {
          externalContactId: normalized.externalContactId,
          displayName: normalized.contactDisplayName,
          phoneE164: normalized.contactPhoneE164,
        });

        const { created, message } = await insertInboundMessage({
          organizationId: account.organizationId,
          conversation,
          account,
          externalMessageId: normalized.externalMessageId,
          body: normalized.text,
          sourceWebhookEventId: webhookEventId,
          occurredAt: normalized.occurredAt,
        });

        if (created && message) {
          await recordActivity({
            organizationId: account.organizationId,
            type: "MESSAGE_RECEIVED",
            actorUserId: null,
            entityType: "conversation",
            entityId: conversation.id,
            metadata: { messageId: message.id },
          });
        }
      } else if (normalized.kind === "OUTBOUND_ECHO") {
        // The delegate wrote this on their own phone. It can be the first
        // thing we ever see of a conversation (a chat they started
        // themselves), so it resolves the Conversation exactly like an
        // inbound message does.
        const conversation = await findOrCreateConversation(account.organizationId, account, normalized.externalConversationId, {
          externalContactId: normalized.externalContactId,
          displayName: normalized.contactDisplayName,
          phoneE164: normalized.contactPhoneE164,
        });

        const { created, message } = await insertEchoedMessage({
          organizationId: account.organizationId,
          conversation,
          account,
          externalMessageId: normalized.externalMessageId,
          body: normalized.text,
          sourceWebhookEventId: webhookEventId,
          occurredAt: normalized.occurredAt,
        });

        if (created && message) {
          // Distinct from MESSAGE_SENT on purpose: nobody acted in Kindly,
          // so there is no actor user and the two are not the same event.
          await recordActivity({
            organizationId: account.organizationId,
            type: "MESSAGE_SENT_FROM_DEVICE",
            actorUserId: null,
            entityType: "conversation",
            entityId: conversation.id,
            metadata: { messageId: message.id },
          });
        }
      } else if (normalized.kind === "HISTORY_MESSAGE") {
        const conversation = await findOrCreateConversation(account.organizationId, account, normalized.externalConversationId, {
          externalContactId: normalized.externalContactId,
          displayName: normalized.contactDisplayName,
          phoneE164: normalized.contactPhoneE164,
        });

        await importHistoryMessage({
          organizationId: account.organizationId,
          conversation,
          account,
          externalMessageId: normalized.externalMessageId,
          direction: normalized.direction,
          body: normalized.text,
          sourceWebhookEventId: webhookEventId,
          occurredAt: normalized.occurredAt,
        });

        // History is the past, not news: 180 days of imported threads must
        // not land in the Inbox as a wall of unread conversations, and
        // must not emit one Activity per message. Marking read up to the
        // imported message's own timestamp leaves anything genuinely newer
        // still unread.
        await markConversationReadUpTo(account.organizationId, conversation.id, normalized.occurredAt);
      } else if (normalized.kind === "ACCOUNT_DISCONNECTED") {
        await applyProviderDisconnection(account.id, normalized.reason);
      } else {
        await applyDeliveryUpdate(account.id, normalized.externalMessageId, normalized.deliveryStatus);
      }
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, webhookEventId));
  } catch (error) {
    await db
      .update(webhookEvents)
      .set({ processingError: error instanceof Error ? error.message : String(error) })
      .where(eq(webhookEvents.id, webhookEventId));
  }
}
