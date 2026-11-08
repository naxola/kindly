import { withTenant, type Db } from '@saas/database'
import { z } from 'zod'
import type { EmailSender } from '../../email.ts'
import { isLocale } from '../../i18n.ts'
import { defineJob, type JobContext } from '../../jobs.ts'
import { organizationAdmins } from '../identity/index.ts'
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
