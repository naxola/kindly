import { DomainError } from '@saas/core'
import { createMiddleware } from 'hono/factory'
import type { ApiEnv } from './types.ts'

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Fixed-window rate limiter per key, in process memory (a single web instance). With
 * several replicas it must move to Postgres or a shared store. Answers 429.
 */
export function rateLimit(opts: {
  limit: number
  windowMs: number
  /** Keys to limit; `null` ones (e.g. unknown IP) are skipped. */
  keys: (c: Parameters<Parameters<typeof createMiddleware<ApiEnv>>[0]>[0]) => (string | null)[]
}) {
  const buckets = new Map<string, Bucket>()
  return createMiddleware<ApiEnv>(async (c, next) => {
    const now = Date.now()
    if (buckets.size > 10_000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    }
    for (const key of opts.keys(c)) {
      if (!key) continue
      let b = buckets.get(key)
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + opts.windowMs }
        buckets.set(key, b)
      }
      b.count += 1
      if (b.count > opts.limit) {
        c.header('retry-after', String(Math.ceil((b.resetAt - now) / 1000)))
        throw new DomainError('RATE_LIMITED', 'Too many requests')
      }
    }
    await next()
  })
}
