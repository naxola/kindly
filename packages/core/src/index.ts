// Public API of @saas/core. Each domain module is re-exported from its index.ts.
export { DomainError, isDomainError, ERROR_HTTP_STATUS } from './errors.ts'
export type { ErrorCode, ErrorDetail } from './errors.ts'
export { nowOf } from './context.ts'
export type { BaseCtx, Ctx } from './context.ts'
export { defineJob } from './jobs.ts'
export type { JobDefinition, JobQueue, JobMeta, JobContext, EnqueueOptions } from './jobs.ts'
export { renderActionEmail } from './email.ts'
export type { ActionEmail, EmailMessage, EmailSender, RenderedEmail } from './email.ts'
export { LOCALES, DEFAULT_LOCALE, isLocale } from './i18n.ts'
export type { Locale } from './i18n.ts'
export * from './modules/audit/index.ts'
export * from './modules/events/index.ts'
export * from './modules/identity/index.ts'
export * from './modules/billing/index.ts'
export * from './modules/team/index.ts'
export * from './modules/activity/index.ts'
export * from './modules/contacts/index.ts'
export * from './modules/affiliations/index.ts'
export * from './modules/tasks/index.ts'
export * from './modules/conversations/index.ts'
export * from './modules/knowledge/index.ts'
export * from './modules/messaging/index.ts'

import {
  BILLING_SCHEDULES,
  closeDuePeriodsScanJob,
  chargePeriodJob,
  closePeriodsJob,
  providerEventJob,
  quotaAlertEmailJob,
} from './modules/billing/index.ts'
import { deliverEventJob } from './modules/events/index.ts'
import { ingestVersionJob } from './modules/knowledge/index.ts'
import { processWebhookJob } from './modules/messaging/index.ts'
import {
  invitationEmailJob,
  passwordResetEmailJob,
  verificationEmailJob,
} from './modules/identity/index.ts'

/**
 * Every job the template defines. The worker test fails if one has no consumer, so a
 * new job cannot be enqueued forever without anyone processing it. Products append theirs.
 */
export const ALL_JOBS = [
  verificationEmailJob,
  passwordResetEmailJob,
  invitationEmailJob,
  deliverEventJob,
  processWebhookJob,
  quotaAlertEmailJob,
  closeDuePeriodsScanJob,
  closePeriodsJob,
  chargePeriodJob,
  providerEventJob,
  ingestVersionJob,
] as const

/** Recurring jobs (cron, UTC). The worker registers them on start. */
export const ALL_SCHEDULES = [...BILLING_SCHEDULES] as const
