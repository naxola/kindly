import type { EnqueueOptions, JobContext, JobDefinition, JobQueue } from '@saas/core'
import type { TenantTx } from '@saas/database'
import { fromPrisma, PgBoss } from 'pg-boss'
import { v5 as uuidv5 } from 'uuid'
import type { z } from 'zod'
import type { Logger } from '../logger/index.ts'

/** Fixed namespace to derive deterministic job ids from the idempotency key. */
const JOB_ID_NAMESPACE = '3f6c1d2e-8a5b-4c7d-9e0f-1a2b3c4d5e6f'

export const PGBOSS_SCHEMA = 'pgboss'

export interface CreateBossOptions {
  connectionString: string
  /** `producer`: only enqueues (web). `worker`: also consumes and runs maintenance. */
  role: 'producer' | 'worker'
  max?: number
}

export function createBoss({ connectionString, role, max = 5 }: CreateBossOptions): PgBoss {
  return new PgBoss({
    connectionString,
    schema: PGBOSS_SCHEMA,
    max,
    application_name: `saas-${role}`,
    // Only the worker migrates the pg-boss schema, supervises and runs schedules.
    migrate: role === 'worker',
    createSchema: false,
    supervise: role === 'worker',
    schedule: role === 'worker',
  })
}

interface Envelope {
  meta: { organizationId: string | null; correlationId: string }
  payload: unknown
}

export const jobIdFor = (jobName: string, idempotencyKey: string) =>
  uuidv5(`${jobName}:${idempotencyKey}`, JOB_ID_NAMESPACE)

async function ensureQueue(boss: PgBoss, job: JobDefinition, ensured: Set<string>) {
  if (ensured.has(job.name)) return
  const existing = await boss.getQueue(job.name)
  if (!existing) {
    try {
      await boss.createQueue(job.name, {
        retryLimit: job.retryLimit,
        retryDelay: job.retryDelaySeconds,
        retryBackoff: true,
        expireInSeconds: job.expireInSeconds,
      })
    } catch (err) {
      // Race with another process that created it at the same time.
      if (!(await boss.getQueue(job.name))) throw err
    }
  }
  ensured.add(job.name)
}

export class PgBossJobQueue implements JobQueue {
  private readonly ensured = new Set<string>()

  constructor(private readonly boss: PgBoss) {}

  async enqueue<S extends z.ZodType>(
    tx: TenantTx,
    job: JobDefinition<S>,
    payload: z.input<S>,
    { idempotencyKey, organizationId, correlationId, startAfter }: EnqueueOptions,
  ) {
    const data = job.schema.parse(payload)
    await ensureQueue(this.boss, job, this.ensured)
    const id = jobIdFor(job.name, idempotencyKey)
    const envelope: Envelope = { meta: { organizationId, correlationId }, payload: data }
    const result = await this.boss.send(job.name, envelope, {
      id,
      db: fromPrisma(tx),
      ...(startAfter ? { startAfter } : {}),
    })
    return { id, created: result !== null }
  }
}

export interface FinalFailure {
  job: string
  jobId: string
  organizationId: string | null
  correlationId: string
  attempt: number
  error: unknown
}

export type JobHandler<S extends z.ZodType> = (
  payload: z.output<S>,
  ctx: JobContext & { log: Logger },
) => Promise<void>

/**
 * Registers a consumer. At-least-once execution: the handler must be idempotent.
 * If the handler throws, pg-boss retries with backoff and, once retries are exhausted,
 * leaves the job in state `failed` (visible and alertable). A job is never dropped silently.
 */
export async function registerWorker<S extends z.ZodType>(
  boss: PgBoss,
  job: JobDefinition<S>,
  handler: JobHandler<S>,
  {
    log,
    concurrency = 1,
    onFinalFailure,
  }: {
    log: Logger
    concurrency?: number
    /** Called once when a job exhausts its retries (alerts, error tracking). Never throws. */
    onFinalFailure?: (failure: FinalFailure) => void | Promise<void>
  },
) {
  await ensureQueue(boss, job, new Set())
  return boss.work<Envelope>(job.name, { localConcurrency: concurrency }, async ([raw]) => {
    if (!raw) return
    const { meta, payload } = raw.data
    const jobLog = log.child({ job: job.name, jobId: raw.id, correlationId: meta.correlationId })
    const parsed = job.schema.safeParse(payload)
    if (!parsed.success) {
      jobLog.error({ issues: parsed.error.issues }, 'invalid job payload')
      throw new Error(`Invalid payload for job ${job.name}`)
    }
    const start = performance.now()
    const attempt = (raw as { retryCount?: number }).retryCount ?? 0
    try {
      await handler(parsed.data, { ...meta, jobId: raw.id, attempt, log: jobLog })
      jobLog.info({ attempt, durationMs: Math.round(performance.now() - start) }, 'job completed')
    } catch (err) {
      // `error` only for the final failure: that is what alerts are hooked on (ADR 0008).
      const final = attempt >= job.retryLimit
      const fields = { err, attempt, final, durationMs: Math.round(performance.now() - start) }
      if (final) {
        jobLog.error(fields, 'job failed permanently')
        try {
          await onFinalFailure?.({
            job: job.name,
            jobId: raw.id,
            organizationId: meta.organizationId,
            correlationId: meta.correlationId,
            attempt,
            error: err,
          })
        } catch (hookErr) {
          jobLog.error({ err: hookErr }, 'final failure hook failed')
        }
      } else jobLog.warn(fields, 'job failed, will retry')
      throw err
    }
  })
}

/**
 * Recurring platform job (cron, UTC). Idempotent: re-registering on every start replaces the
 * schedule. A missed occurrence (worker down) is sent once when the worker comes back.
 */
export async function scheduleJob<S extends z.ZodType>(
  boss: PgBoss,
  job: JobDefinition<S>,
  cron: string,
  payload: z.input<S>,
) {
  await ensureQueue(boss, job, new Set())
  const envelope: Envelope = {
    meta: { organizationId: null, correlationId: `schedule:${job.name}` },
    payload: job.schema.parse(payload),
  }
  await boss.schedule(job.name, cron, envelope, { tz: 'UTC', missed: 'once' })
}

/** State of the queues, read from the pg-boss tables (version pinned in ADR 0009). */
export interface QueueSnapshot {
  queues: {
    name: string
    counts: Partial<
      Record<'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed', number>
    >
    /** Seconds the oldest job ready to run has been waiting; null if none waits. */
    oldestWaitingSeconds: number | null
  }[]
  recentFailures: {
    name: string
    id: string
    failedAt: Date | null
    attempts: number
    correlationId: string | null
    message: string | null
  }[]
}

export async function queueSnapshot(boss: PgBoss, { failures = 10 } = {}): Promise<QueueSnapshot> {
  const db = boss.getDb()
  const s = PGBOSS_SCHEMA
  const counts = await db.executeSql(
    `SELECT name, state::text AS state, count(*)::int AS n FROM ${s}.job GROUP BY name, state`,
  )
  const waiting = await db.executeSql(
    `SELECT name, extract(epoch FROM now() - min(start_after))::int AS seconds FROM ${s}.job
     WHERE state IN ('created', 'retry') AND start_after <= now() GROUP BY name`,
  )
  const failed = await db.executeSql(
    `SELECT name, id, completed_on, retry_count, data->'meta'->>'correlationId' AS correlation_id,
            output->>'message' AS message
     FROM ${s}.job WHERE state = 'failed' ORDER BY completed_on DESC NULLS LAST LIMIT $1`,
    [failures],
  )
  const byName = new Map<string, QueueSnapshot['queues'][number]>()
  const queue = (name: string) => {
    let q = byName.get(name)
    if (!q) byName.set(name, (q = { name, counts: {}, oldestWaitingSeconds: null }))
    return q
  }
  for (const r of counts.rows as {
    name: string
    state: keyof QueueSnapshot['queues'][number]['counts']
    n: number
  }[]) {
    queue(r.name).counts[r.state] = r.n
  }
  for (const r of waiting.rows as { name: string; seconds: number }[]) {
    queue(r.name).oldestWaitingSeconds = r.seconds
  }
  return {
    queues: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    recentFailures: (
      failed.rows as {
        name: string
        id: string
        completed_on: Date | null
        retry_count: number
        correlation_id: string | null
        message: string | null
      }[]
    ).map((r) => ({
      name: r.name,
      id: r.id,
      failedAt: r.completed_on,
      attempts: r.retry_count + 1,
      correlationId: r.correlation_id,
      message: r.message,
    })),
  }
}

/** Queues whose oldest ready job has waited longer than allowed: nobody is consuming them. */
export function stuckQueues(snapshot: QueueSnapshot, maxWaitSeconds: number) {
  return snapshot.queues.filter(
    (q) => q.oldestWaitingSeconds !== null && q.oldestWaitingSeconds > maxWaitSeconds,
  )
}

export { PgBoss }
