import {
  DEFAULT_LOCALE,
  passwordResetEmailJob,
  verificationEmailJob,
  type JobQueue,
} from '@saas/core'
import { newId, type Db } from '@saas/database'
import { createHash } from 'node:crypto'
import type { AuthEmail } from './index.ts'

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex')

/**
 * Access emails through the queue (ADR 0004): Better Auth only enqueues, the worker sends.
 * One email per token: requesting again creates another token and therefore another job.
 * Access emails belong to no organization and use the default locale (the access layer
 * knows no business preferences).
 */
export function queuedAuthEmails(db: Db, queue: JobQueue) {
  const enqueue =
    (job: typeof verificationEmailJob | typeof passwordResetEmailJob) =>
    async ({ to, name, url, token }: AuthEmail) => {
      await db.$transaction((tx) =>
        queue.enqueue(
          tx,
          job,
          { to, name, url, locale: DEFAULT_LOCALE },
          { organizationId: null, correlationId: newId(), idempotencyKey: sha256(token) },
        ),
      )
    }
  return {
    sendVerificationEmail: enqueue(verificationEmailJob),
    sendResetPasswordEmail: enqueue(passwordResetEmailJob),
  }
}
