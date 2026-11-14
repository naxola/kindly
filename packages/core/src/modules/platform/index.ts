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

/** Every day at 03:23 (UTC). */
export const PLATFORM_SCHEDULES = [{ job: purgeRateLimitsJob, cron: '23 3 * * *' }] as const
