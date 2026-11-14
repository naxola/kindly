import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, newId, withTenant, type Db } from '../src/index.ts'

let db: Db
let tight: Db

beforeAll(() => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  tight = createDb({
    connectionString: process.env.DATABASE_URL!,
    max: 2,
    timeouts: { statementMs: 300, lockMs: 300, idleInTransactionMs: 500 },
  })
})

afterAll(async () => {
  await db.$disconnect()
  await tight.$disconnect()
})

describe('Postgres time limits (R2.2)', () => {
  it('every connection gets the default limits', async () => {
    const rows = await db.$queryRaw<{ name: string; setting: string }[]>`
      SELECT name, setting FROM pg_settings
      WHERE name IN ('statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout')`
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.setting]))
    expect(byName).toEqual({
      statement_timeout: '30000',
      lock_timeout: '5000',
      idle_in_transaction_session_timeout: '60000',
    })
  })

  it('a statement over the limit is cancelled with SQLSTATE 57014', async () => {
    const started = Date.now()
    await expect(tight.$queryRaw`SELECT pg_sleep(5)`).rejects.toSatisfy((e: unknown) =>
      JSON.stringify(e, Object.getOwnPropertyNames(e)).includes('57014'),
    )
    expect(Date.now() - started).toBeLessThan(3000)
  })

  it('the same limit applies inside a tenant transaction, and the pool recovers', async () => {
    await expect(
      withTenant(tight, newId(), (tx) => tx.$queryRaw`SELECT pg_sleep(5)`),
    ).rejects.toBeDefined()
    await expect(tight.$queryRaw`SELECT 1 AS ok`).resolves.toEqual([{ ok: 1 }])
  })
})
