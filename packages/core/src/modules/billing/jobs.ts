import { newId, withTenant, type Db } from '@saas/database'
import { z } from 'zod'
import type { EmailSender } from '../../email.ts'
import { isLocale } from '../../i18n.ts'
import { defineJob, type JobContext, type JobQueue } from '../../jobs.ts'
import { organizationAdmins } from '../identity/index.ts'
import { CATALOG, type Catalog } from './catalog.ts'
import { closeDuePeriods } from './close.ts'
import type { PaymentProvider, ProviderEvent } from './provider.ts'
import { applyProviderEvent } from './subscriptions.ts'
import { quotaAlertEmail } from './emails.ts'

/** Notice to the organization's ADMINs when a quota reaches 80 % or 100 % (ADR 0012). */
export const quotaAlertEmailJob = defineJob({
  name: 'billing.quota-alert-email',
  schema: z.object({
    organizationId: z.uuid(),
    metric: z.string(),
    unit: z.string(),
    threshold: z.number().int().positive(),
    used: z.string(),
    included: z.string(),
    hardLimit: z.boolean(),
    url: z.url(),
  }),
})

export const billingEmailHandlers = (sender: EmailSender, db: Db) => ({
  quotaAlert: async (p: z.output<typeof quotaAlertEmailJob.schema>, ctx: JobContext) => {
    const admins = await withTenant(db, p.organizationId, (tx) => organizationAdmins(tx))
    for (const admin of admins) {
      await sender.send({
        to: admin.email,
        // One email per admin and alert, whatever the retries.
        idempotencyKey: `${quotaAlertEmailJob.name}:${ctx.jobId}:${admin.memberId}`,
        ...quotaAlertEmail(isLocale(admin.locale) ? admin.locale : 'es', {
          organizationName: admin.organizationName,
          metric: p.metric,
          unit: p.unit,
          threshold: p.threshold,
          used: p.used,
          included: p.included,
          hardLimit: p.hardLimit,
          url: p.url,
        }),
      })
    }
  },
})

/** Platform job, scheduled every hour: one close job per organization with a subscription. */
export const closeDuePeriodsScanJob = defineJob({
  name: 'billing.close-due-periods',
  schema: z.object({}),
  retryLimit: 2,
})

/** Closes the due periods of one organization, in its tenant context. Idempotent. */
export const closePeriodsJob = defineJob({
  name: 'billing.close-periods',
  schema: z.object({ organizationId: z.uuid() }),
})

/** Every hour, at minute 7 (UTC). */
export const BILLING_SCHEDULES = [{ job: closeDuePeriodsScanJob, cron: '7 * * * *' }] as const

export interface BillingJobDeps {
  db: Db
  queue: JobQueue
  appUrl: string
  now?: () => Date
  catalog?: Catalog
}

export const billingCloseHandlers = ({
  db,
  queue,
  appUrl,
  now,
  catalog = CATALOG,
}: BillingJobDeps) => ({
  scan: async (_p: unknown, ctx: JobContext) => {
    // Only the organization ids cross tenants (SECURITY DEFINER function, ADR 0002).
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM app.organizations_with_subscription() AS id`
    const hour = (now ? now() : new Date()).toISOString().slice(0, 13)
    for (const { id } of rows) {
      await withTenant(db, id, (tx) =>
        queue.enqueue(
          tx,
          closePeriodsJob,
          { organizationId: id },
          {
            organizationId: id,
            correlationId: ctx.correlationId,
            idempotencyKey: `close:${id}:${hour}`,
          },
        ),
      )
    }
  },
  close: async (p: z.output<typeof closePeriodsJob.schema>, ctx: JobContext) => {
    await withTenant(db, p.organizationId, (tx) =>
      closeDuePeriods(
        { db, queue, appUrl, correlationId: ctx.correlationId ?? newId(), ...(now ? { now } : {}) },
        tx,
        p.organizationId,
        catalog,
      ),
    )
  },
})

/**
 * Charges the amount due of a closed period at the provider. Never retried automatically:
 * the provider call is not idempotent. The period goes PENDING_CHARGE → CHARGING (committed
 * before the call) → CHARGED. A provider error marks CHARGE_FAILED; anything that leaves the
 * outcome unknown stays CHARGING. Both alert (final failure) for a person to check the
 * provider before retrying with `pnpm ops:queue retry` (ADR 0014).
 */
export const chargePeriodJob = defineJob({
  name: 'billing.charge-period',
  schema: z.object({ organizationId: z.uuid(), periodId: z.uuid() }),
  retryLimit: 0,
})

/**
 * The provider may or may not have charged this period: the outcome is unknown, so it is never
 * retried automatically. A person checks the provider first (docs/operations.md).
 */
export class ChargeOutcomeUnknownError extends Error {
  constructor(
    public readonly periodId: string,
    reason: string,
  ) {
    super(`Charge of period ${periodId}: ${reason}. Check the provider before retrying.`)
    this.name = 'ChargeOutcomeUnknownError'
  }
}

export const billingChargeHandler =
  ({ db, provider }: { db: Db; provider: PaymentProvider | null }) =>
  async (p: z.output<typeof chargePeriodJob.schema>, _ctx: JobContext) => {
    const { period, sub } = await withTenant(db, p.organizationId, async (tx) => {
      const period = await tx.billingPeriod.findUnique({ where: { id: p.periodId } })
      const sub = period
        ? await tx.subscription.findUnique({ where: { organizationId: p.organizationId } })
        : null
      return { period, sub }
    })
    // Already charged (a manual retry after checking the provider) or nothing to charge.
    if (!period || period.status === 'CHARGED' || period.amountDue.lte(0)) return
    // A previous run marked it CHARGING and never recorded the result: the provider may have
    // charged. Never charge again from here; `ops:queue retry --force` resets it on purpose.
    if (period.status === 'CHARGING') {
      throw new ChargeOutcomeUnknownError(period.id, 'a previous attempt did not record its result')
    }
    const setStatus = (status: 'CHARGED' | 'CHARGE_FAILED', ref: string | null) =>
      withTenant(db, p.organizationId, (tx) =>
        tx.billingPeriod.update({
          where: { id: period.id },
          data: {
            status,
            providerChargeRef: ref,
            chargedAt: status === 'CHARGED' ? new Date() : null,
          },
        }),
      )
    // Configuration problems happen before anything is sent: a plain, safe failure.
    if (!provider || !sub?.providerSubscriptionId || sub.provider !== provider.name) {
      await setStatus('CHARGE_FAILED', null)
      throw new Error(
        provider
          ? 'The subscription is not at the configured provider'
          : 'No payment provider configured',
      )
    }
    // Commit CHARGING before calling the provider; only one runner can win the transition.
    const claimed = await withTenant(db, p.organizationId, (tx) =>
      tx.billingPeriod.updateMany({
        where: { id: period.id, status: { in: ['PENDING_CHARGE', 'CHARGE_FAILED'] } },
        data: { status: 'CHARGING' },
      }),
    )
    if (claimed.count === 0) {
      throw new ChargeOutcomeUnknownError(period.id, 'its status changed while starting the charge')
    }
    try {
      await provider.chargeOverage({
        subscriptionRef: sub.providerSubscriptionId,
        amount: period.amountDue.toFixed(2),
        currency: period.currency as 'EUR' | 'USD',
        description: `Usage ${period.periodStart.toISOString().slice(0, 10)} – ${period.periodEnd.toISOString().slice(0, 10)}`,
        periodId: period.id,
      })
    } catch (err) {
      // Only an error from the provider means "not charged".
      await setStatus('CHARGE_FAILED', null)
      throw err
    }
    try {
      await setStatus('CHARGED', `${provider.name}:${sub.providerSubscriptionId}:${period.id}`)
    } catch (err) {
      // Charged at the provider but not recorded: stays CHARGING (never CHARGE_FAILED).
      throw new ChargeOutcomeUnknownError(
        period.id,
        `charged at the provider but the result was not recorded (${err instanceof Error ? err.message : 'unknown error'})`,
      )
    }
  }

const isoDate = z.iso.datetime().transform((v) => new Date(v))

/** A verified provider event, normalized, as the webhook route enqueues it. */
export const ProviderEventPayload = z.object({
  organizationId: z.uuid(),
  provider: z.string(),
  event: z.discriminatedUnion('kind', [
    z.object({ id: z.string(), occurredAt: isoDate, kind: z.literal('ignored'), type: z.string() }),
    z.object({
      id: z.string(),
      occurredAt: isoDate,
      kind: z.literal('subscription'),
      subscription: z.object({
        ref: z.string(),
        customerRef: z.string(),
        status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']),
        priceId: z.string(),
        periodStart: isoDate.nullable(),
        periodEnd: isoDate.nullable(),
        cancelAtPeriodEnd: z.boolean(),
        organizationId: z.uuid().nullable(),
      }),
    }),
  ]),
})

/** Serializes a parsed event for the queue (dates as ISO strings). */
export const providerEventPayload = (
  organizationId: string,
  provider: string,
  e: ProviderEvent,
) => ({
  organizationId,
  provider,
  event:
    e.kind === 'ignored'
      ? { ...e, occurredAt: e.occurredAt.toISOString() }
      : {
          ...e,
          occurredAt: e.occurredAt.toISOString(),
          subscription: {
            ...e.subscription,
            periodStart: e.subscription.periodStart?.toISOString() ?? null,
            periodEnd: e.subscription.periodEnd?.toISOString() ?? null,
          },
        },
})

/** Applies a provider event to the subscription. Safe to retry: stale events are skipped. */
export const providerEventJob = defineJob({
  name: 'billing.provider-event',
  schema: ProviderEventPayload,
  retryLimit: 8,
  retryDelaySeconds: 30,
})

export const providerEventHandler =
  ({ db, queue, appUrl, catalog = CATALOG }: BillingJobDeps) =>
  async (p: z.output<typeof ProviderEventPayload>, ctx: JobContext) => {
    await withTenant(db, p.organizationId, (tx) =>
      applyProviderEvent(
        { db, queue, appUrl, correlationId: ctx.correlationId },
        tx,
        p.organizationId,
        p.event,
        p.provider,
        catalog,
      ),
    )
  }
