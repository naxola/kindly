import { z } from 'zod'
import { defineJob } from '../../jobs.ts'

/**
 * Housekeeping of the platform itself (no tenant, no business rule). The work is done by the
 * adapter that owns each store; here live only the job definitions and their schedules, so the
 * worker test can check that every job has a consumer.
 */

/** Deletes the counters of the request limiter whose window ended long ago (ADR 0015). */
export const purgeRateLimitsJob = defineJob({
  name: 'platform.purge-rate-limits',
  schema: z.object({}),
  retryLimit: 2,
  retryDelaySeconds: 300,
})

/** Deletes audit entries older than the retention period (ADR 0018). */
export const purgeAuditLogsJob = defineJob({
  name: 'platform.purge-audit-logs',
  schema: z.object({}),
  retryLimit: 2,
  retryDelaySeconds: 300,
})

/** Every day, in the small hours (UTC). */
export const PLATFORM_SCHEDULES = [
  { job: purgeRateLimitsJob, cron: '23 3 * * *' },
  { job: purgeAuditLogsJob, cron: '41 3 * * *' },
] as const
