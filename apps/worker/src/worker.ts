import { createAlertSender, type AlertSender } from '@saas/adapters/alerts'
import { createEmailSender } from '@saas/adapters/email'
import { captureError, initErrorTracking } from '@saas/adapters/errors'
import { LogEventSink, WebhookEventSink } from '@saas/adapters/events'
import type { Logger } from '@saas/adapters/logger'
import {
  createBoss,
  queueSnapshot,
  PgBossJobQueue,
  registerWorker,
  scheduleJob,
  stuckQueues,
  type FinalFailure,
  type PgBoss,
} from '@saas/adapters/queue'
import { ALL_SCHEDULES, type EmailSender, type EventSink } from '@saas/core'
import { createDb, type Db } from '@saas/database'
import type { Server } from 'node:http'
import { loadEmailEnv, loadEventsEnv, loadObservabilityEnv, type WorkerEnv } from './env.ts'
import { startHealthServer, startHeartbeat } from './health.ts'
import { registrations } from './handlers.ts'

export interface StartWorkerOptions {
  env: WorkerEnv
  log: Logger
  /** Tests inject fakes; otherwise they are built from the environment. */
  email?: EmailSender
  events?: EventSink
  alerts?: AlertSender
  /** How often the queues are checked for stuck jobs (default 5 minutes). */
  healthCheckIntervalMs?: number
}

export interface RunningWorker {
  boss: PgBoss
  db: Db
  queues: string[]
  /** Runs the stuck-queue check now (also run on an interval). */
  checkQueues: () => Promise<void>
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
  const observability = loadObservabilityEnv()
  initErrorTracking({ dsn: observability.SENTRY_DSN, environment: env.APP_ENV, service: 'worker' })
  const alerts = overrides.alerts ?? createAlertSender(observability, log)

  const onFinalFailure = async (f: FinalFailure) => {
    captureError(f.error, {
      correlationId: f.correlationId,
      organizationId: f.organizationId,
      tags: { job: f.job, jobId: f.jobId },
    })
    await alerts.send({
      key: `job-failed:${f.job}`,
      severity: 'critical',
      title: `Job failed for good: ${f.job}`,
      body: `Job ${f.jobId} failed after ${f.attempt + 1} attempts (correlationId ${f.correlationId}). See \`pnpm ops:queue\` and the runbook.`,
    })
  }

  const db = createDb({ connectionString: env.DATABASE_URL })
  const boss = createBoss({ connectionString: env.DATABASE_URL, role: 'worker' })
  boss.on('error', (err) => log.error({ err }, 'pg-boss error'))
  await boss.start()
  const queue = new PgBossJobQueue(boss)
  for (const { job, handler } of selected) {
    await registerWorker(boss, job, handler({ db, email, events, queue, appUrl: env.APP_URL }), {
      log,
      concurrency: env.WORKER_CONCURRENCY,
      onFinalFailure,
    })
  }
  const queues = selected.map((r) => r.job.name)
  // Schedules of the queues this process consumes (re-registered on every start).
  for (const { job, cron } of ALL_SCHEDULES) {
    if (queues.includes(job.name)) await scheduleJob(boss, job, cron, {})
  }

  // A queue nobody consumes (worker of that queue down, poison backlog) raises an alert.
  const checkQueues = async () => {
    try {
      for (const q of stuckQueues(await queueSnapshot(boss), env.QUEUE_MAX_WAIT_SECONDS)) {
        await alerts.send({
          key: `queue-stuck:${q.name}`,
          severity: 'warning',
          title: `Queue not draining: ${q.name}`,
          body: `The oldest ready job has waited ${Math.round(q.oldestWaitingSeconds! / 60)} min. Is the worker of this queue running?`,
        })
      }
    } catch (err) {
      log.error({ err }, 'queue health check failed')
    }
  }
  const interval = setInterval(
    () => void checkQueues(),
    overrides.healthCheckIntervalMs ?? 5 * 60_000,
  )
  interval.unref()

  const ready = async () => {
    await db.$queryRaw`SELECT 1`
    return true
  }
  let health: Server | null = null
  if (env.WORKER_HEALTH_PORT > 0) health = await startHealthServer(env.WORKER_HEALTH_PORT, ready)
  const heartbeat = env.HEARTBEAT_URL
    ? startHeartbeat({
        url: env.HEARTBEAT_URL,
        intervalMs: env.HEARTBEAT_INTERVAL_SECONDS * 1000,
        ready,
        onError: (reason) => log.warn({ reason }, 'heartbeat not sent'),
      })
    : null
  log.info(
    { queues, healthPort: env.WORKER_HEALTH_PORT || null, heartbeat: Boolean(heartbeat) },
    'worker started',
  )

  return {
    boss,
    db,
    queues,
    checkQueues,
    stop: async () => {
      clearInterval(interval)
      heartbeat?.stop()
      await new Promise<void>((resolve) => (health ? health.close(() => resolve()) : resolve()))
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
