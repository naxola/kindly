import type { Db } from '@saas/database'
import { createHash } from 'node:crypto'

/**
 * Request limiter stored in Postgres (ADR 0015): the counters survive restarts and are shared by
 * every replica. Fixed window, one atomic statement per request.
 */
export interface RateLimitRule {
  /** Requests allowed per window. */
  max: number
  /** Window length in seconds. */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  /** Requests counted in the current window, this one included. */
  count: number
  /** Seconds until the window ends (what `Retry-After` should say). */
  retryAfterSeconds: number
}

/**
 * Key of a counter: a hash, so the table never holds an IP, an email or an id in the clear.
 * `scope` separates limits that share an identifier (e.g. `api` and `invitations`).
 */
export const rateLimitKey = (scope: string, id: string) =>
  createHash('sha256').update(`${scope}:${id}`).digest('hex')

/**
 * Counts one request against `key` and says whether it fits. Atomic: N simultaneous requests
 * cannot all read a stale count, because the read and the increment are one statement.
 */
export async function consumeRateLimit(
  db: Db,
  key: string,
  { max, windowSeconds }: RateLimitRule,
): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<{ count: number; elapsed: number }[]>`
    INSERT INTO rate_limits AS r (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN r.window_start <= now() - make_interval(secs => ${windowSeconds}) THEN 1
        ELSE r.count + 1
      END,
      window_start = CASE
        WHEN r.window_start <= now() - make_interval(secs => ${windowSeconds}) THEN now()
        ELSE r.window_start
      END
    RETURNING count, EXTRACT(EPOCH FROM now() - window_start)::float8 AS elapsed`
  const { count, elapsed } = rows[0]!
  return {
    allowed: count <= max,
    count,
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  }
}

/** Deletes counters whose window ended long ago. Returns how many. */
export async function purgeRateLimits(db: Db, olderThanSeconds = 86_400 * 2): Promise<number> {
  const { count } = await db.rateLimit.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - olderThanSeconds * 1000) } },
  })
  return count
}

/**
 * Storage for Better Auth's own limiter (`rateLimit.customStorage`), on the same table. Its keys
 * carry the client IP and the path, so they are hashed like the rest.
 */
export const betterAuthRateLimitStorage = (db: Db) => ({
  consume: async (key: string, rule: { window: number; max: number }) => {
    const result = await consumeRateLimit(db, rateLimitKey('auth', key), {
      max: rule.max,
      windowSeconds: rule.window,
    })
    return {
      allowed: result.allowed,
      retryAfter: result.allowed ? null : result.retryAfterSeconds,
    }
  },
})
