import { createEmailSender } from '@saas/adapters/email'
import { LogEventSink, WebhookEventSink } from '@saas/adapters/events'
import type { Logger } from '@saas/adapters/logger'
import { createBoss, registerWorker, type PgBoss } from '@saas/adapters/queue'
import type { EmailSender, EventSink } from '@saas/core'
import { createDb, type Db } from '@saas/database'
import { loadEmailEnv, loadEventsEnv, type WorkerEnv } from './env.ts'
import { registrations } from './handlers.ts'

export interface StartWorkerOptions {
  env: WorkerEnv
  log: Logger
  /** Tests inject fakes; otherwise they are built from the environment. */
  email?: EmailSender
  events?: EventSink
}

export interface RunningWorker {
  boss: PgBoss
  db: Db
  queues: string[]
  stop: () => Promise<void>
}

/** Starts pg-boss as consumer and registers the selected queues. */
export async function startWorker({
  env,
  log,
  ...overrides
}: StartWorkerOptions): Promise<RunningWorker> {
  const selected = registrations.filter(
    (r) => !env.WORKER_QUEUES || env.WORKER_QUEUES.includes(r.job.name),
  )
  const unknown = env.WORKER_QUEUES?.filter((q) => !registrations.some((r) => r.job.name === q))
  if (unknown?.length) throw new Error(`Unknown queues in WORKER_QUEUES: ${unknown.join(', ')}`)

  // Validated at startup (not at the first email) if a selected queue sends email.
  const sender =
    overrides.email ??
    (selected.some((r) => r.sendsEmail) ? createEmailSender(loadEmailEnv(env.APP_ENV), log) : null)
  const email = () => {
    if (!sender) throw new Error('Email is not configured for this worker')
    return sender
  }
  const events = overrides.events ?? eventSinkFromEnv(log)

  const db = createDb({ connectionString: env.DATABASE_URL })
  const boss = createBoss({ connectionString: env.DATABASE_URL, role: 'worker' })
  boss.on('error', (err) => log.error({ err }, 'pg-boss error'))
  await boss.start()
  for (const { job, handler } of selected) {
    await registerWorker(boss, job, handler({ db, email, events }), {
      log,
      concurrency: env.WORKER_CONCURRENCY,
    })
  }
  const queues = selected.map((r) => r.job.name)
  log.info({ queues }, 'worker started')

  return {
    boss,
    db,
    queues,
    stop: async () => {
      // Waits for running jobs (pg-boss puts them back in the queue if the timeout is hit).
      await boss.stop({ graceful: true, timeout: 30_000 })
      await db.$disconnect()
    },
  }
}

function eventSinkFromEnv(log: Logger): EventSink {
  const env = loadEventsEnv()
  if (!env.EVENTS_WEBHOOK_URL) {
    log.warn('EVENTS_WEBHOOK_URL not set: business events are only logged')
    return new LogEventSink(log)
  }
  return new WebhookEventSink({ url: env.EVENTS_WEBHOOK_URL, secret: env.EVENTS_WEBHOOK_SECRET! })
}
