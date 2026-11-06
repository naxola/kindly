import 'server-only'
import { createBoss, PgBossJobQueue, type PgBoss } from '@saas/adapters/queue'
import type { EnqueueOptions, JobDefinition, JobQueue } from '@saas/core'
import type { TenantTx } from '@saas/database'
import type { z } from 'zod'
import { env } from './env.ts'
import { logger } from './logger.ts'

const globalForQueue = globalThis as unknown as { __queue?: { boss: PgBoss; ready: Promise<void> } }

/**
 * Job producer: the web only enqueues, the worker consumes (ADR 0004). pg-boss starts once,
 * on first use, and each send goes inside the use case's transaction.
 */
export async function queue(): Promise<JobQueue> {
  if (!globalForQueue.__queue) {
    const boss = createBoss({ connectionString: env().DATABASE_URL, role: 'producer' })
    boss.on('error', (err) => logger().error({ err }, 'pg-boss error'))
    globalForQueue.__queue = { boss, ready: boss.start().then(() => undefined) }
  }
  await globalForQueue.__queue.ready
  return new PgBossJobQueue(globalForQueue.__queue.boss)
}

/** Synchronous facade for code configured at startup (Better Auth): resolves the queue on send. */
export const lazyQueue: JobQueue = {
  async enqueue<S extends z.ZodType>(
    tx: TenantTx,
    job: JobDefinition<S>,
    payload: z.input<S>,
    options: EnqueueOptions,
  ) {
    return (await queue()).enqueue(tx, job, payload, options)
  },
}
