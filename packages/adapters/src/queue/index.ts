import {
  DEFAULT_DB_TIMEOUTS,
  WORKER_DB_TIMEOUTS,
  dbTimeoutOptions,
  type DbTimeouts,
} from '@saas/config/db-timeouts'
import type { EnqueueOptions, JobContext, JobDefinition, JobQueue } from '@saas/core'
import type { TenantTx } from '@saas/database'
import { fromPrisma, PgBoss, type Job, type JobResult } from 'pg-boss'
import { v5 as uuidv5 } from 'uuid'
import type { z } from 'zod'
import type { Logger } from '../logger/index.ts'

/** Fixed namespace to derive deterministic job ids from the idempotency key. */
const JOB_ID_NAMESPACE = '3f6c1d2e-8a5b-4c7d-9e0f-1a2b3c4d5e6f'

export const PGBOSS_SCHEMA = 'pgboss'

/** Jobs a worker takes per fetch (see `registerWorker`). */
const WORK_BATCH_SIZE = 5

export interface CreateBossOptions {
  connectionString: string
  /** `producer`: only enqueues (web). `worker`: also consumes and runs maintenance. */
  role: 'producer' | 'worker'
  max?: number
  /** Postgres time limits that override the role's defaults (R2.2). */
  timeouts?: Partial<DbTimeouts>
}

export function createBoss({
  connectionString,
  role,
  max = 5,
  timeouts,
}: CreateBossOptions): PgBoss {
  return new PgBoss({
    connectionString,
    schema: PGBOSS_SCHEMA,
    max,
    // Postgres time limits (R2.2); the worker gets more room than the producers.
    options: dbTimeoutOptions({
      ...(role === 'worker' ? WORKER_DB_TIMEOUTS : DEFAULT_DB_TIMEOUTS),
      ...timeouts,
    }),
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

/** Queue settings that pg-boss stores per queue and that come from `defineJob`. */
const queueOptionsOf = (job: JobDefinition) => ({
  retryLimit: job.retryLimit,
  retryDelay: job.retryDelaySeconds,
  retryBackoff: true,
  expireInSeconds: job.expireInSeconds,
})

/**
 * Creates the queue if missing. With `update`, an existing queue whose stored settings differ
 * from `defineJob` is updated: pg-boss never changes them by itself, and the final-failure
 * decision (`attempt >= job.retryLimit`) must match what pg-boss really does.
 */
async function ensureQueue(
  boss: PgBoss,
  job: JobDefinition,
  ensured: Set<string>,
  { update = false }: { update?: boolean } = {},
) {
  if (ensured.has(job.name)) return
  const wanted = queueOptionsOf(job)
  const existing = await boss.getQueue(job.name)
  if (!existing) {
    try {
      await boss.createQueue(job.name, wanted)
    } catch (err) {
      // Race with another process that created it at the same time.
      if (!(await boss.getQueue(job.name))) throw err
    }
  } else if (update) {
    const differs = (Object.keys(wanted) as (keyof typeof wanted)[]).some(
      (k) => existing[k] !== wanted[k],
    )
    if (differs) await boss.updateQueue(job.name, wanted)
  }
  ensured.add(job.name)
}

/** Creates the queues of `jobs` and brings the settings of existing ones in line with them. */
export async function syncQueues(boss: PgBoss, jobs: readonly JobDefinition[]) {
  for (const job of jobs) await ensureQueue(boss, job, new Set(), { update: true })
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
    onJobDone,
  }: {
    log: Logger
    concurrency?: number
    /** Called after every attempt with how it ended and how long it took (metrics). Never throws. */
    onJobDone?: (done: {
      job: string
      result: 'completed' | 'retry' | 'failed'
      seconds: number
    }) => void
    /** Called once when a job exhausts its retries (alerts, error tracking). Never throws. */
    onFinalFailure?: (failure: FinalFailure) => void | Promise<void>
  },
) {
  await ensureQueue(boss, job, new Set(), { update: true })

  /** One job: its own logging, retry accounting and final-failure hook. Never throws. */
  const runOne = async (raw: Job<Envelope>): Promise<JobResult> => {
    const { meta, payload } = raw.data
    const jobLog = log.child({ job: job.name, jobId: raw.id, correlationId: meta.correlationId })
    const start = performance.now()
    const attempt = (raw as { retryCount?: number }).retryCount ?? 0
    const done = (result: 'completed' | 'retry' | 'failed') => {
      try {
        onJobDone?.({ job: job.name, result, seconds: (performance.now() - start) / 1000 })
      } catch {
        // Metrics must never change how a job ends.
      }
    }
    try {
      const parsed = job.schema.safeParse(payload)
      if (!parsed.success) {
        jobLog.error({ issues: parsed.error.issues }, 'invalid job payload')
        throw new Error(`Invalid payload for job ${job.name}`)
      }
      await handler(parsed.data, { ...meta, jobId: raw.id, attempt, log: jobLog })
      jobLog.info({ attempt, durationMs: Math.round(performance.now() - start) }, 'job completed')
      done('completed')
      return { id: raw.id, status: 'completed' }
    } catch (err) {
      // `error` only for the final failure: that is what alerts are hooked on (ADR 0008).
      const final = attempt >= job.retryLimit
      done(final ? 'failed' : 'retry')
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
      // pg-boss retries (with backoff) or fails it for good, exactly as if the handler had thrown.
      return {
        id: raw.id,
        status: 'failed',
        output: { message: err instanceof Error ? err.message : String(err) },
      }
    }
  }

  // Each fetch takes up to `WORK_BATCH_SIZE` jobs, which are run one after another (like one
  // worker always did), and while fetches come back full the worker fetches again at once.
  // With one job per fetch and a 2 s poll, a queue moved at most `concurrency / 2` jobs a second
  // however fast the handler was, so a burst of events or emails took minutes to drain. Each job
  // is settled on its own (`perJobResults`): one failure does not retry its neighbours.
  return boss.work<Envelope, JobResult[]>(
    job.name,
    {
      localConcurrency: concurrency,
      batchSize: WORK_BATCH_SIZE,
      burstWhenBatchFull: true,
      perJobResults: true,
    },
    async (raws) => {
      const results: JobResult[] = []
      for (const raw of raws) results.push(await runOne(raw))
      return results
    },
  )
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

export interface FailedJob {
  name: string
  id: string
  failedAt: Date
  attempts: number
  correlationId: string | null
  organizationId: string | null
  message: string | null
}

/**
 * Jobs of `queues` that ended in `failed` at or after `since`, plus the database clock at the
 * time of the read (use it, minus a margin, as the next `since`). This is what catches jobs that
 * exhausted their retries without the handler's `catch` running (expiry, worker crash).
 */
export async function failedJobsSince(
  boss: PgBoss,
  queues: string[],
  since: Date,
  { limit = 50 } = {},
): Promise<{ jobs: FailedJob[]; now: Date }> {
  // Read the clock first: a job that fails while we read is then still after the next `since`.
  const clock = await boss.getDb().executeSql('SELECT now() AS db_now')
  const res = await boss.getDb().executeSql(
    `SELECT name, id, completed_on, retry_count, data->'meta'->>'correlationId' AS correlation_id,
            data->'meta'->>'organizationId' AS organization_id, output->>'message' AS message
     FROM ${PGBOSS_SCHEMA}.job
     WHERE state = 'failed' AND name = ANY($1) AND completed_on >= $2
     ORDER BY completed_on LIMIT $3`,
    [queues, since, limit],
  )
  const rows = res.rows as {
    name: string
    id: string
    completed_on: Date
    retry_count: number
    correlation_id: string | null
    organization_id: string | null
    message: string | null
  }[]
  return {
    now: (clock.rows[0] as { db_now: Date }).db_now,
    jobs: rows.map((r) => ({
      name: r.name,
      id: r.id,
      failedAt: r.completed_on,
      attempts: r.retry_count + 1,
      correlationId: r.correlation_id,
      organizationId: r.organization_id,
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
