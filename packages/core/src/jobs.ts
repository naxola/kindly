import type { TenantTx } from '@saas/database'
import type { z } from 'zod'

/**
 * Asynchronous jobs (ADR 0004). Producers and consumers share the definition, so the
 * payload is typed and validated at both ends.
 */
export interface JobDefinition<S extends z.ZodType = z.ZodType> {
  name: string
  schema: S
  /** Retries before the final failure. */
  retryLimit: number
  /** Initial delay of the exponential backoff, in seconds. */
  retryDelaySeconds: number
  /** Maximum run time of one attempt, in seconds. */
  expireInSeconds: number
}

export function defineJob<S extends z.ZodType>(
  def: Pick<JobDefinition<S>, 'name' | 'schema'> & Partial<JobDefinition<S>>,
): JobDefinition<S> {
  if (!/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(def.name)) {
    throw new Error(`Invalid job name '${def.name}': use 'module.action'`)
  }
  return { retryLimit: 5, retryDelaySeconds: 10, expireInSeconds: 15 * 60, ...def }
}

export interface JobMeta {
  /** Organization in whose context the job runs; null only for platform jobs. */
  organizationId: string | null
  correlationId: string
}

export interface EnqueueOptions extends JobMeta {
  /**
   * Idempotency key: two sends with the same key for the same job create a single job.
   * It must identify the business effect (e.g. `invitation:{id}`), not the request.
   */
  idempotencyKey: string
  startAfter?: Date
}

export interface JobQueue {
  /**
   * Enqueues the job inside transaction `tx`: if the transaction rolls back, the job does
   * not exist. Returns `created: false` if a job with the same idempotency key existed.
   */
  enqueue<S extends z.ZodType>(
    tx: TenantTx,
    job: JobDefinition<S>,
    payload: z.input<S>,
    options: EnqueueOptions,
  ): Promise<{ id: string; created: boolean }>
}

export interface JobContext extends JobMeta {
  jobId: string
  /** Attempt number (0 = first). */
  attempt: number
}
