import {
  InvalidTenantError,
  withMessagingAccount,
  withTenant,
  type Db,
  type MessagingAccount,
  type TenantTx,
} from '@saas/database'
import { z } from 'zod'
import type { JobContext, JobQueue } from '../../jobs.ts'
import { defineJob } from '../../jobs.ts'
import { recordActivity } from '../activity/index.ts'
import {
  applyDeliveryUpdate,
  findOrCreateConversation,
  markConversationReadUpTo,
  recordMessage,
} from '../conversations/index.ts'
import { applyProviderDisconnection } from './accounts.ts'
import type { MessagingAdapter, MessagingRegistry, NormalizedInboundEvent } from './port.ts'

/**
 * Inbound pipeline (docs/ARCHITECTURE.md §7): verify the signature -> persist the raw event and
 * enqueue its processing in ONE transaction -> answer 200 -> a worker normalizes it later.
 *
 * An invalid signature is rejected before anything is persisted: no record of a forged or
 * misattributed request is kept. Processing is a job (pg-boss), not `after()`: it is retried with
 * backoff, survives a restart and a final failure is visible and alerts.
 */

export const processWebhookJob = defineJob({
  name: 'messaging.process-webhook',
  schema: z.object({ webhookEventId: z.uuid() }),
  retryLimit: 8,
  retryDelaySeconds: 15,
})

export type WebhookOutcome =
  { status: 404 } | { status: 401 } | { status: 200; webhookEventId: string }

export interface ReceiveDeps {
  db: Db
  queue: JobQueue
  registry: MessagingRegistry
  correlationId: string
}

/**
 * The account of a public webhook URL, resolved before the organization is known with a context
 * that lets RLS read that one row. Null if the id is malformed, unknown or of another channel.
 */
async function resolveAccount(db: Db, channel: string, accountId: string) {
  try {
    return await withMessagingAccount(db, accountId, (tx) =>
      tx.messagingAccount.findFirst({ where: { id: accountId, channel } }),
    )
  } catch (error) {
    if (error instanceof InvalidTenantError) return null
    throw error
  }
}

export async function receiveWebhook(
  deps: ReceiveDeps,
  channel: string,
  accountId: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<WebhookOutcome> {
  const adapter = deps.registry.get(channel)
  if (!adapter) return { status: 404 }
  const account = await resolveAccount(deps.db, channel, accountId)
  if (!account) return { status: 404 }
  if (!adapter.verifyWebhookSignature(rawBody, headers, account)) return { status: 401 }

  const webhookEventId = await withTenant(deps.db, account.organizationId, async (tx) => {
    const event = await tx.webhookEvent.create({
      data: {
        organizationId: account.organizationId,
        messagingAccountId: account.id,
        channel,
        rawBody,
        headers,
      },
    })
    await deps.queue.enqueue(
      tx,
      processWebhookJob,
      { webhookEventId: event.id },
      {
        organizationId: account.organizationId,
        correlationId: deps.correlationId,
        idempotencyKey: `webhook:${event.id}`,
      },
    )
    return event.id
  })
  return { status: 200, webhookEventId }
}

/**
 * The GET side of the webhook route: a provider's subscription handshake. Nothing is persisted: it
 * is not an event, only proof that whoever registered the URL knows the verify token.
 */
export async function verifyWebhookSubscription(
  deps: Pick<ReceiveDeps, 'db' | 'registry'>,
  channel: string,
  accountId: string,
  query: URLSearchParams,
): Promise<{ status: 404 } | { status: 403 } | { status: 200; body: string }> {
  const adapter = deps.registry.get(channel)
  if (!adapter?.verifyWebhookChallenge) return { status: 404 }
  if (!(await resolveAccount(deps.db, channel, accountId))) return { status: 404 }
  const body = adapter.verifyWebhookChallenge(query)
  return body === null ? { status: 403 } : { status: 200, body }
}

export interface ProcessDeps {
  db: Db
  registry: MessagingRegistry
}

/**
 * Normalizes and applies one stored webhook, atomically: all its events in one transaction, so a
 * retry after a failure starts from nothing and the per-message unique key absorbs duplicates.
 * A failure is recorded on the event (in its own transaction, the failed one rolled back) and
 * rethrown so the queue retries it.
 */
export async function processWebhookEvent(
  deps: ProcessDeps,
  organizationId: string,
  webhookEventId: string,
  now: () => Date = () => new Date(),
): Promise<void> {
  try {
    await withTenant(deps.db, organizationId, async (tx) => {
      const event = await tx.webhookEvent.findUnique({
        where: { organizationId_id: { organizationId, id: webhookEventId } },
        include: { messagingAccount: true },
      })
      if (!event || event.processedAt) return
      const adapter = deps.registry.get(event.channel)
      if (!adapter) throw new Error(`No MessagingAdapter for channel "${event.channel}"`)
      const parsed = adapter.parseWebhookEvents(
        event.rawBody,
        event.headers as Record<string, string>,
      )
      for (const normalized of parsed) {
        await applyEvent(tx, event.messagingAccount, event.id, normalized)
      }
      await tx.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: now(), processingError: null },
      })
    })
  } catch (error) {
    await withTenant(deps.db, organizationId, (tx) =>
      tx.webhookEvent.updateMany({
        where: { id: webhookEventId, processedAt: null },
        data: { processingError: error instanceof Error ? error.message : String(error) },
      }),
    ).catch(() => undefined)
    throw error
  }
}

async function applyEvent(
  tx: TenantTx,
  account: MessagingAccount,
  webhookEventId: string,
  e: NormalizedInboundEvent,
): Promise<void> {
  if (e.kind === 'ACCOUNT_DISCONNECTED') {
    await applyProviderDisconnection(tx, account, e.reason, e.occurredAt)
    return
  }
  if (e.kind === 'DELIVERY_UPDATE') {
    await applyDeliveryUpdate(tx, account.id, e.externalMessageId, e.deliveryStatus)
    return
  }
  // Every message-shaped event resolves the conversation the same way: an echo can be the first
  // thing ever seen of a chat the delegate started from their phone.
  const conversation = await findOrCreateConversation(tx, account, e.externalConversationId, {
    externalContactId: e.externalContactId,
    displayName: e.contactDisplayName ?? null,
    phone: e.contactPhone ?? null,
  })
  const base = {
    conversation,
    account,
    externalMessageId: e.externalMessageId,
    body: e.text,
    sourceWebhookEventId: webhookEventId,
    occurredAt: e.occurredAt,
  }
  if (e.kind === 'MESSAGE') {
    const { created, message } = await recordMessage(tx, { ...base, origin: 'INBOUND' })
    if (created && message) {
      await recordActivity(tx, {
        organizationId: account.organizationId,
        type: 'MESSAGE_RECEIVED',
        actorMemberId: null,
        entityType: 'conversation',
        entityId: conversation.id,
        metadata: { messageId: message.id },
      })
    }
  } else if (e.kind === 'OUTBOUND_ECHO') {
    const { created, message } = await recordMessage(tx, { ...base, origin: 'ECHO' })
    if (created && message) {
      // Distinct from a message sent from Kindly: nobody acted here, there is no actor.
      await recordActivity(tx, {
        organizationId: account.organizationId,
        type: 'MESSAGE_SENT_FROM_DEVICE',
        actorMemberId: null,
        entityType: 'conversation',
        entityId: conversation.id,
        metadata: { messageId: message.id },
      })
    }
  } else {
    await recordMessage(tx, { ...base, origin: 'HISTORY', direction: e.direction })
    // History is the past, not news: it must not land in the inbox as unread nor emit activity.
    await markConversationReadUpTo(tx, conversation.id, e.occurredAt)
  }
}

export const processWebhookHandler =
  (deps: ProcessDeps) =>
  async (payload: z.output<typeof processWebhookJob.schema>, ctx: JobContext): Promise<void> => {
    if (!ctx.organizationId) throw new Error('process-webhook needs an organization')
    await processWebhookEvent(deps, ctx.organizationId, payload.webhookEventId)
  }

export type { MessagingAdapter }
