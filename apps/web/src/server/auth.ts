import 'server-only'
import {
  createAuth,
  createPasswordBreachCheck,
  queuedAuthEmails,
  type Auth,
} from '@saas/adapters/auth'
import { authSecretsOf } from '@saas/config/env'
import { captureError } from '@saas/adapters/errors'
import { db } from './db.ts'
import { env } from './env.ts'
import { logger } from './logger.ts'
import { lazyQueue } from './queue.ts'

const globalForAuth = globalThis as unknown as { __auth?: Auth }

/** Breached-password check shared by Better Auth and the invitation sign-up (ADR 0016). */
export const passwordBreachCheck = () =>
  createPasswordBreachCheck({
    enabled: env().PASSWORD_BREACH_CHECK,
    onUnavailable: (reason) =>
      logger().warn({ reason }, 'password breach check unavailable: password accepted'),
  })

/** Access layer (ADR 0003). Its emails are enqueued and sent by the worker. */
export function auth(): Auth {
  const e = env()
  globalForAuth.__auth ??= createAuth({
    db: db(),
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    secrets: authSecretsOf(e),
    passwordBreachCheck: passwordBreachCheck(),
    rateLimit: e.AUTH_RATE_LIMIT_ENABLED,
    ...(e.TRUSTED_IP_HEADER ? { trustedIpHeader: e.TRUSTED_IP_HEADER } : {}),
    ...queuedAuthEmails(db(), lazyQueue),
    onUnexpectedError: (err) => {
      logger().error({ err }, 'auth error')
      captureError(err, { tags: { layer: 'auth' } })
    },
  })
  return globalForAuth.__auth
}
