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
  { log, concurrency = 1 }: { log: Logger; concurrency?: number },
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
      if (final) jobLog.error(fields, 'job failed permanently')
      else jobLog.warn(fields, 'job failed, will retry')
      throw err
    }
  })
}

export { PgBoss }
