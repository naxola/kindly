import 'server-only'
import { createAuth, queuedAuthEmails, type Auth } from '@saas/adapters/auth'
import { captureError } from '@saas/adapters/errors'
import { db } from './db.ts'
import { env } from './env.ts'
import { logger } from './logger.ts'
import { lazyQueue } from './queue.ts'

const globalForAuth = globalThis as unknown as { __auth?: Auth }

/** Access layer (ADR 0003). Its emails are enqueued and sent by the worker. */
export function auth(): Auth {
  const e = env()
  globalForAuth.__auth ??= createAuth({
    db: db(),
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    rateLimit: e.AUTH_RATE_LIMIT_ENABLED,
    ...queuedAuthEmails(db(), lazyQueue),
    onUnexpectedError: (err) => {
      logger().error({ err }, 'auth error')
      captureError(err, { tags: { layer: 'auth' } })
    },
  })
  return globalForAuth.__auth
}
