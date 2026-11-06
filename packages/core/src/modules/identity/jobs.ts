import { z } from 'zod'
import type { EmailSender } from '../../email.ts'
import { LOCALES } from '../../i18n.ts'
import { defineJob, type JobContext } from '../../jobs.ts'
import { invitationEmail, passwordResetEmail, verificationEmail } from './emails.ts'

const locale = z.enum(LOCALES)

/**
 * Identity emails, always asynchronous. The payload carries the URL with the token: it
 * lives in the pg-boss table until the job is archived, never in the logs.
 */
export const verificationEmailJob = defineJob({
  name: 'identity.verification-email',
  schema: z.object({ to: z.email(), name: z.string(), locale, url: z.url() }),
})

export const passwordResetEmailJob = defineJob({
  name: 'identity.password-reset-email',
  schema: z.object({ to: z.email(), name: z.string(), locale, url: z.url() }),
})

export const invitationEmailJob = defineJob({
  name: 'identity.invitation-email',
  schema: z.object({
    to: z.email(),
    locale,
    organizationName: z.string(),
    inviterName: z.string(),
    url: z.url(),
    expiresInDays: z.number().int().positive(),
  }),
})

type Payload<J extends { schema: z.ZodType }> = z.output<J['schema']>

/**
 * Handlers. The provider idempotency key is the job id (deterministic from the enqueue
 * key), so a retry never sends two different emails.
 */
export const identityEmailHandlers = (sender: EmailSender) => ({
  verification: async (p: Payload<typeof verificationEmailJob>, ctx: JobContext) => {
    await sender.send({
      to: p.to,
      idempotencyKey: `${verificationEmailJob.name}:${ctx.jobId}`,
      ...verificationEmail(p.locale, p.name, p.url),
    })
  },
  passwordReset: async (p: Payload<typeof passwordResetEmailJob>, ctx: JobContext) => {
    await sender.send({
      to: p.to,
      idempotencyKey: `${passwordResetEmailJob.name}:${ctx.jobId}`,
      ...passwordResetEmail(p.locale, p.name, p.url),
    })
  },
  invitation: async (p: Payload<typeof invitationEmailJob>, ctx: JobContext) => {
    await sender.send({
      to: p.to,
      idempotencyKey: `${invitationEmailJob.name}:${ctx.jobId}`,
      ...invitationEmail(p.locale, p.organizationName, p.inviterName, p.url, p.expiresInDays),
    })
  },
})
