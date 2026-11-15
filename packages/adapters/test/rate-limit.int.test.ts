import { createDb, newId, type Db } from '@saas/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  betterAuthRateLimitStorage,
  consumeRateLimit,
  purgeRateLimits,
  rateLimitKey,
} from '../src/rate-limit/index.ts'

let db: Db
beforeAll(() => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
})
afterAll(() => db.$disconnect())

const key = (scope = 'test') => rateLimitKey(scope, newId())

describe('rate limiter in Postgres (ADR 0015)', () => {
  it('allows up to the limit and refuses the next one, with the time left', async () => {
    const k = key()
    const rule = { max: 3, windowSeconds: 60 }
    const results = []
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(db, k, rule))
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false])
    expect(results[3]!.count).toBe(4)
    expect(results[3]!.retryAfterSeconds).toBeGreaterThan(50)
    expect(results[3]!.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('is atomic: simultaneous requests cannot all pass', async () => {
    const k = key()
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(db, k, { max: 5, windowSeconds: 60 })),
    )
    expect(results.filter((r) => r.allowed)).toHaveLength(5)
  })

  it('survives a new connection pool (a restart or another replica)', async () => {
    const k = key()
    const rule = { max: 1, windowSeconds: 60 }
    expect((await consumeRateLimit(db, k, rule)).allowed).toBe(true)
    const other = createDb({ connectionString: process.env.DATABASE_URL!, max: 1 })
    try {
      expect((await consumeRateLimit(other, k, rule)).allowed).toBe(false)
    } finally {
      await other.$disconnect()
    }
  })

  it('starts a new window once the previous one has ended', async () => {
    const k = key()
    const rule = { max: 1, windowSeconds: 1 }
    expect((await consumeRateLimit(db, k, rule)).allowed).toBe(true)
    expect((await consumeRateLimit(db, k, rule)).allowed).toBe(false)
    await new Promise((r) => setTimeout(r, 1100))
    expect(await consumeRateLimit(db, k, rule)).toMatchObject({ allowed: true, count: 1 })
  })

  it('stores only hashes, and separates scopes that share an identifier', async () => {
    const id = `203.0.113.7-${newId()}`
    expect(rateLimitKey('api', id)).toMatch(/^[0-9a-f]{64}$/)
    expect(rateLimitKey('api', id)).not.toBe(rateLimitKey('invitations', id))
    await consumeRateLimit(db, rateLimitKey('api', id), { max: 5, windowSeconds: 60 })
    const rows = await db.rateLimit.findMany({ where: { key: { contains: '203.0.113' } } })
    expect(rows).toEqual([])
  })

  it('purges only the counters whose window ended long ago', async () => {
    const old = key()
    const fresh = key()
    await consumeRateLimit(db, old, { max: 5, windowSeconds: 60 })
    await consumeRateLimit(db, fresh, { max: 5, windowSeconds: 60 })
    await db.rateLimit.update({
      where: { key: old },
      data: { windowStart: new Date(Date.now() - 3 * 86_400_000) },
    })
    expect(await purgeRateLimits(db)).toBeGreaterThanOrEqual(1)
    expect(await db.rateLimit.findUnique({ where: { key: old } })).toBeNull()
    expect(await db.rateLimit.findUnique({ where: { key: fresh } })).not.toBeNull()
  })

  it('serves Better Auth with the same counters', async () => {
    const storage = betterAuthRateLimitStorage(db)
    const k = `203.0.113.9|/sign-in/email|${newId()}`
    const rule = { window: 60, max: 2 }
    expect(await storage.consume(k, rule)).toEqual({ allowed: true, retryAfter: null })
    expect((await storage.consume(k, rule)).allowed).toBe(true)
    const third = await storage.consume(k, rule)
    expect(third.allowed).toBe(false)
    expect(third.retryAfter).toBeGreaterThan(0)
  })
})
