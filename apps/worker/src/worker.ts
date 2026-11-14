import { createAlertSender, type AlertSender } from '@saas/adapters/alerts'
import { createPaymentProvider } from '@saas/adapters/payments'
import { loadPaymentEnv } from '@saas/config/env'
import { createEmailSender, SuppressingEmailSender } from '@saas/adapters/email'
import { captureError, initErrorTracking } from '@saas/adapters/errors'
import { LogEventSink, WebhookEventSink } from '@saas/adapters/events'
import type { Logger } from '@saas/adapters/logger'
import {
  createBoss,
  failedJobsSince,
  queueSnapshot,
  PgBossJobQueue,
  registerWorker,
  scheduleJob,
  stuckQueues,
  type FinalFailure,
  type PgBoss,
} from '@saas/adapters/queue'
import {
  ALL_SCHEDULES,
  ChargeOutcomeUnknownError,
  type EmailSender,
  type EventSink,
  type PaymentProvider,
} from '@saas/core'
import { WORKER_DB_TIMEOUTS, dbTimeoutsFromEnv } from '@saas/config/db-timeouts'
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
  payments?: PaymentProvider | null
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
  // Every email goes through the suppression list first (ADR 0017). Built on first use: the
  // database client is created further down.
  let guarded: EmailSender | null = null
  const email = () => {
    if (!sender) throw new Error('Email is not configured for this worker')
    guarded ??= new SuppressingEmailSender(sender, db, log)
    return guarded
  }
  const events = overrides.events ?? eventSinkFromEnv(log)
  const observability = loadObservabilityEnv()
  initErrorTracking({
    dsn: observability.SENTRY_DSN,
    environment: env.APP_ENV,
    service: 'worker',
    // main.ts installs its own handlers for uncaught errors (R5.3).
    manualProcessErrors: true,
  })
  const alerts = overrides.alerts ?? createAlertSender(observability, log)
  const payments =
    overrides.payments !== undefined ? overrides.payments : createPaymentProvider(loadPaymentEnv())

  // Jobs already reported as failed for good, so the handler's report and the periodic sweep
  // below never alert twice for the same job. Bounded: the sweep window is minutes.
  const reportedFailures = new Set<string>()
  const markReported = (id: string) => {
    if (reportedFailures.size >= 1000)
      reportedFailures.delete(reportedFailures.values().next().value!)
    reportedFailures.add(id)
  }
  const failedAlert = (
    job: string,
    jobId: string,
    attempts: number,
    correlationId: string | null,
    unknownCharge = false,
  ) =>
    alerts.send({
      key: `job-failed:${job}`,
      severity: 'critical',
      title: `Job failed for good: ${job}`,
      body:
        `Job ${jobId} failed after ${attempts} attempts (correlationId ${correlationId ?? 'unknown'}). ` +
        (unknownCharge
          ? 'The charge may have gone through: CHECK THE PAYMENT PROVIDER before retrying (runbook: CHARGING).'
          : 'See `pnpm ops:queue` and the runbook.'),
    })

  const onFinalFailure = async (f: FinalFailure) => {
    markReported(f.jobId)
    captureError(f.error, {
      correlationId: f.correlationId,
      organizationId: f.organizationId,
      tags: { job: f.job, jobId: f.jobId },
    })
    await failedAlert(
      f.job,
      f.jobId,
      f.attempt + 1,
      f.correlationId,
      f.error instanceof ChargeOutcomeUnknownError,
    )
  }

  const timeouts = dbTimeoutsFromEnv(env)
  const db = createDb({
    connectionString: env.DATABASE_URL,
    timeouts: { ...WORKER_DB_TIMEOUTS, ...timeouts },
  })
  const boss = createBoss({ connectionString: env.DATABASE_URL, role: 'worker', timeouts })
  boss.on('error', (err) => log.error({ err }, 'pg-boss error'))
  await boss.start()
  const queue = new PgBossJobQueue(boss)
  // Failures that happened while this worker was down are not reported: only those from now on.
  let failuresSince = (await failedJobsSince(boss, [], new Date())).now
  for (const { job, handler } of selected) {
    await registerWorker(
      boss,
      job,
      handler({ db, email, events, queue, appUrl: env.APP_URL, payments }),
      {
        log,
        concurrency: env.WORKER_CONCURRENCY,
        onFinalFailure,
      },
    )
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
    await reportSilentFailures()
  }

  // Jobs that exhausted their retries without the handler's `catch` running (expired while
  // running, worker killed) end in `failed` with no alert from the handler: report them here.
  async function reportSilentFailures() {
    try {
      // A margin before the last read covers jobs committed just after it; `reportedFailures`
      // removes the duplicates.
      const since = new Date(failuresSince.getTime() - 60_000)
      const { jobs, now } = await failedJobsSince(boss, queues, since)
      for (const j of jobs) {
        if (reportedFailures.has(j.id)) continue
        markReported(j.id)
        const correlationId = j.correlationId ?? undefined
        log.error(
          { job: j.name, jobId: j.id, correlationId, attempts: j.attempts },
          'job failed permanently (found by the sweep: it expired or the worker was lost)',
        )
        captureError(new Error(j.message ?? `Job ${j.name} failed permanently`), {
          ...(correlationId ? { correlationId } : {}),
          organizationId: j.organizationId,
          tags: { job: j.name, jobId: j.id, source: 'sweep' },
        })
        await failedAlert(j.name, j.id, j.attempts, j.correlationId)
      }
      failuresSince = now
    } catch (err) {
      log.error({ err }, 'failed-job sweep failed')
    }
  }
  const interval = setInterval(
    () => void checkQueues(),
    overrides.healthCheckIntervalMs ?? 5 * 60_000,
  )
  interval.unref()

  const ready = async () => {
    // Both connections: the application's (Prisma) and the queue's (pg-boss).
    await db.$queryRaw`SELECT 1`
    await boss.getDb().executeSql('SELECT 1')
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
