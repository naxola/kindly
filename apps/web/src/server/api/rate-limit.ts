import { consumeRateLimit, rateLimitKey } from '@saas/adapters/rate-limit'
import { captureError } from '@saas/adapters/errors'
import { DomainError } from '@saas/core'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { db } from '../db.ts'
import type { ApiEnv } from './types.ts'

/**
 * Fixed-window rate limiter per key, stored in Postgres (ADR 0015): the counters survive a
 * restart and are shared by every replica. Answers 429 with `Retry-After`.
 *
 * If the store fails the request goes through (fail-open, decided in ADR 0015): a broken
 * limiter must not take the API down. The access endpoints (`/api/auth/*`) use the same store
 * through Better Auth and fail closed there.
 */
export async function enforceRateLimit(
  c: Context<ApiEnv>,
  {
    scope,
    key,
    limit,
    windowSeconds,
  }: {
    /** Separates limits that share a key (e.g. `api` and `invitations`). */
    scope: string
    key: string
    limit: number
    windowSeconds: number
  },
) {
  let result
  try {
    result = await consumeRateLimit(db(), rateLimitKey(scope, key), { max: limit, windowSeconds })
  } catch (err) {
    const log = c.get('log') as ApiEnv['Variables']['log'] | undefined
    log?.error({ err, scope }, 'rate limiter unavailable: request allowed')
    captureError(err, { correlationId: c.get('correlationId'), tags: { layer: 'rate-limit' } })
    return
  }
  if (!result.allowed) {
    c.header('retry-after', String(result.retryAfterSeconds))
    throw new DomainError('RATE_LIMITED', 'Too many requests')
  }
}

export function rateLimit(opts: {
  scope: string
  limit: number
  windowMs: number
  /** Keys to limit; `null` ones are skipped. Unknown IPs must map to a shared key, not `null`. */
  keys: (c: Context<ApiEnv>) => (string | null)[]
}) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    for (const key of opts.keys(c)) {
      if (!key) continue
      await enforceRateLimit(c, {
        scope: opts.scope,
        key,
        limit: opts.limit,
        windowSeconds: Math.ceil(opts.windowMs / 1000),
      })
    }
    await next()
  })
}

/** SUPUESTO (ADR 0015): requests per minute of one signed-in person across `/api/v1`. */
export const SESSION_LIMIT_PER_MINUTE = 300
/** SUPUESTO (ADR 0015): invitations (new or resent) an organization may send per day. */
export const INVITATIONS_PER_ORGANIZATION_PER_DAY = 50

/** General limit of `/api/v1` per signed-in person. Anonymous requests have their own limits. */
export const sessionLimit = createMiddleware<ApiEnv>(async (c, next) => {
  const access = c.get('access')
  if (access) {
    await enforceRateLimit(c, {
      scope: 'api',
      key: access.authUserId,
      limit: SESSION_LIMIT_PER_MINUTE,
      windowSeconds: 60,
    })
  }
  await next()
})
