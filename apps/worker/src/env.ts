import { baseEnv, databaseEnv, emailEnv, eventsEnv, parseEnv } from '@saas/config/env'
import { z } from 'zod'

export const workerEnv = baseEnv.extend(databaseEnv.shape).extend({
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(50).default(2),
  /** Queues this process consumes, comma separated. Default: all of them. */
  WORKER_QUEUES: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
    ),
})

export type WorkerEnv = z.infer<typeof workerEnv>

export const loadEnv = (source = process.env) => parseEnv(workerEnv, source)
export const loadEventsEnv = (source = process.env) => parseEnv(eventsEnv, source)

/**
 * Email configuration. The `log` provider (prints emails, sends nothing) is refused
 * outside development and test: in staging a "sent" email must really leave.
 */
export function loadEmailEnv(appEnv: WorkerEnv['APP_ENV'], source = process.env) {
  const env = parseEnv(emailEnv, source)
  if (env.EMAIL_PROVIDER === 'log' && appEnv !== 'development' && appEnv !== 'test') {
    throw new Error(`EMAIL_PROVIDER=log is not allowed in APP_ENV=${appEnv}`)
  }
  return env
}
