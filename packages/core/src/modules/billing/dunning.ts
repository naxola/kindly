import type { Subscription, TenantTx } from '@saas/database'
import { z } from 'zod'
import { nowOf, type BaseCtx } from '../../context.ts'
import { defineJob } from '../../jobs.ts'
import { PAYMENT_GRACE_DAYS } from './state.ts'

/**
 * Notices of a failed payment to the organization's ADMINs (R3.2). Three, once per non-payment:
 * when it becomes PAST_DUE, a reminder before the plan is restricted, and when it is restricted.
 * Without them the organization fell back to the default plan without anyone being told.
 */
export const DUNNING_KINDS = ['PAST_DUE', 'REMINDER', 'RESTRICTED'] as const
export type DunningKind = (typeof DUNNING_KINDS)[number]

/** SUPUESTO: the reminder goes out this many days before the restriction. */
export const DUNNING_REMINDER_DAYS_BEFORE = 2

export const dunningEmailJob = defineJob({
  name: 'billing.dunning-email',
  schema: z.object({
    organizationId: z.uuid(),
    kind: z.enum(DUNNING_KINDS),
    /** When the default plan starts (or started) to apply. */
    restrictsAt: z.iso.datetime(),
    url: z.url(),
  }),
})

const DAY = 24 * 60 * 60 * 1000
const restrictionDate = (pastDueSince: Date) =>
  new Date(pastDueSince.getTime() + PAYMENT_GRACE_DAYS * DAY)

async function enqueue(
  ctx: BaseCtx,
  tx: TenantTx,
  sub: Pick<Subscription, 'id' | 'organizationId'>,
  pastDueSince: Date,
  kind: DunningKind,
) {
  await ctx.queue.enqueue(
    tx,
    dunningEmailJob,
    {
      organizationId: sub.organizationId,
      kind,
      restrictsAt: restrictionDate(pastDueSince).toISOString(),
      url: `${ctx.appUrl}/settings/billing`,
    },
    {
      organizationId: sub.organizationId,
      correlationId: ctx.correlationId,
      // One per non-payment and stage: `pastDueSince` identifies the non-payment.
      idempotencyKey: `dunning:${sub.id}:${pastDueSince.toISOString()}:${kind}`,
    },
  )
}

/** Called when a subscription has just become PAST_DUE, in the transaction that records it. */
export const enqueuePastDueNotice = (
  ctx: BaseCtx,
  tx: TenantTx,
  sub: Pick<Subscription, 'id' | 'organizationId'>,
  pastDueSince: Date,
) => enqueue(ctx, tx, sub, pastDueSince, 'PAST_DUE')

/**
 * Reminder and restriction notices of an organization, if they are due. Safe to call often
 * (the hourly close does): the idempotency key makes each one go out once.
 */
export async function enqueueDunningFollowUps(ctx: BaseCtx, tx: TenantTx, organizationId: string) {
  const sub = await tx.subscription.findUnique({ where: { organizationId } })
  if (!sub || sub.status !== 'PAST_DUE' || !sub.pastDueSince) return
  const now = nowOf(ctx).getTime()
  const restrictsAt = restrictionDate(sub.pastDueSince).getTime()
  if (now >= restrictsAt) {
    await enqueue(ctx, tx, sub, sub.pastDueSince, 'RESTRICTED')
  } else if (now >= restrictsAt - DUNNING_REMINDER_DAYS_BEFORE * DAY) {
    await enqueue(ctx, tx, sub, sub.pastDueSince, 'REMINDER')
  }
}
