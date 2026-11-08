import { newId, withTenant, type Db } from '@saas/database'
import { z } from 'zod'
import type { EmailSender } from '../../email.ts'
import { isLocale } from '../../i18n.ts'
import { defineJob, type JobContext, type JobQueue } from '../../jobs.ts'
import { organizationAdmins } from '../identity/index.ts'
import { CATALOG, type Catalog } from './catalog.ts'
import { closeDuePeriods } from './close.ts'
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
