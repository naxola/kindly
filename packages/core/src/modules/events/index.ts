import type { TenantTx } from '@saas/database'
import { newId } from '@saas/database'
import { z } from 'zod'
import { nowOf, type BaseCtx } from '../../context.ts'
import { defineJob, type JobContext } from '../../jobs.ts'

/**
 * Business events: the common contract of every product of the portfolio. They are sent
 * to an external webhook (n8n…) that feeds the CRM, notifications and marketing, so a
 * failure there never breaks the product. Products add their own types here.
 *
 * Data minimization: ids and the minimum the receiver needs. Never tokens or passwords.
 */
export const BUSINESS_EVENT_TYPES = [
  'user.created',
  'organization.created',
  'invitation.created',
  'member.joined',
  'usage.threshold_reached',
  'billing.period_closed',
] as const
export type BusinessEventType = (typeof BUSINESS_EVENT_TYPES)[number]

export const BusinessEvent = z.object({
  /** Stable id: receivers deduplicate by it (at-least-once delivery). */
  id: z.uuid(),
  type: z.enum(BUSINESS_EVENT_TYPES),
  occurredAt: z.iso.datetime(),
  organizationId: z.uuid().nullable(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
})
export type BusinessEvent = z.output<typeof BusinessEvent>

export const deliverEventJob = defineJob({
  name: 'events.deliver',
  schema: BusinessEvent,
  // The receiver may be down for a while (a homelab n8n): retry for longer.
  retryLimit: 8,
  retryDelaySeconds: 30,
  expireInSeconds: 60,
})

export interface EmitEventInput {
  type: BusinessEventType
  organizationId: string | null
  /** The business effect this event describes; one event per effect (idempotency). */
  subjectId: string
  data: BusinessEvent['data']
}

/** Emits a business event inside the caller's transaction: it exists only if the change commits. */
export async function emitEvent(ctx: BaseCtx, tx: TenantTx, input: EmitEventInput) {
  const event: BusinessEvent = {
    id: newId(),
    type: input.type,
    occurredAt: nowOf(ctx).toISOString(),
    organizationId: input.organizationId,
    data: input.data,
  }
  await ctx.queue.enqueue(tx, deliverEventJob, event, {
    organizationId: input.organizationId,
    correlationId: ctx.correlationId,
    idempotencyKey: `${input.type}:${input.subjectId}`,
  })
  return event
}

/** Where events go. The adapter signs and sends them; without a receiver, they are only logged. */
export interface EventSink {
  deliver(event: BusinessEvent): Promise<void>
}

export const deliverEventHandler =
  (sink: EventSink) => async (event: BusinessEvent, _ctx: JobContext) => {
    await sink.deliver(event)
  }
