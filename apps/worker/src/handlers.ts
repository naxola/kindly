import type { JobHandler } from '@saas/adapters/queue'
import {
  billingEmailHandlers,
  deliverEventHandler,
  deliverEventJob,
  identityEmailHandlers,
  invitationEmailJob,
  passwordResetEmailJob,
  quotaAlertEmailJob,
  verificationEmailJob,
  type EmailSender,
  type EventSink,
  type JobDefinition,
} from '@saas/core'
import type { Db } from '@saas/database'
import type { z } from 'zod'

export interface HandlerDeps {
  db: Db
  /** Lazy: only resolved if this process consumes a queue that sends email. */
  email: () => EmailSender
  events: EventSink
}

export interface Registration<S extends z.ZodType = z.ZodType> {
  job: JobDefinition<S>
  handler: (deps: HandlerDeps) => JobHandler<S>
  /** The handler sends email (email configuration is required at startup). */
  sendsEmail?: boolean
}

const register = <S extends z.ZodType>(r: Registration<S>) => r as unknown as Registration

/**
 * Consumer registry: the worker is only wiring, the handlers live in core. Each new job
 * is registered here (a test checks that ALL_JOBS are).
 */
export const registrations: Registration[] = [
  register({
    job: verificationEmailJob,
    handler: ({ email }) => identityEmailHandlers(email()).verification,
    sendsEmail: true,
  }),
  register({
    job: passwordResetEmailJob,
    handler: ({ email }) => identityEmailHandlers(email()).passwordReset,
    sendsEmail: true,
  }),
  register({
    job: invitationEmailJob,
    handler: ({ email }) => identityEmailHandlers(email()).invitation,
    sendsEmail: true,
  }),
  register({ job: deliverEventJob, handler: ({ events }) => deliverEventHandler(events) }),
  register({
    job: quotaAlertEmailJob,
    handler: ({ email, db }) => billingEmailHandlers(email(), db).quotaAlert,
    sendsEmail: true,
  }),
]
