import type { Db } from '@saas/database'
import { z } from 'zod'
import { defineJob } from '../../jobs.ts'
import { writeAudit } from '../audit/index.ts'

/**
 * Retention of raw webhook events (docs/DECISIONS.md, 2026-11-16). The raw body holds phone
 * numbers and message text that `messages` already keeps in its own form, so it does not stay for
 * ever: 30 days once processed, 90 days for what failed or was never processed (so it can be
 * retried and diagnosed). The cut-offs live in the SQL function, not here: the application cannot
 * choose them.
 */
export const purgeWebhookEventsJob = defineJob({
  name: 'messaging.purge-webhook-events',
  schema: z.object({}),
  retryLimit: 2,
  retryDelaySeconds: 300,
})

/** Every day, in the small hours (UTC). */
export const MESSAGING_SCHEDULES = [{ job: purgeWebhookEventsJob, cron: '17 4 * * *' }] as const

/**
 * Deletes the expired events in batches, through the database function that owns the rule. The
 * messages that came from them keep their content and lose only the link to the raw event. Returns
 * how many events went; the purge itself is audited (without organization: it spans all of them).
 */
export async function purgeExpiredWebhookEvents(db: Db, maxBatches = 200): Promise<number> {
  let total = 0
  for (let i = 0; i < maxBatches; i++) {
    const rows = await db.$queryRaw<{ deleted: number }[]>`
      SELECT app.purge_expired_webhook_events() AS deleted`
    const deleted = rows[0]?.deleted ?? 0
    total += deleted
    if (deleted === 0) break
  }
  if (total > 0) {
    await db.$transaction((tx) =>
      writeAudit(tx, {
        organizationId: null,
        actorUserId: null,
        action: 'webhook_events.purged',
        resourceType: 'webhook_event',
        after: { deleted: total },
      }),
    )
  }
  return total
}
