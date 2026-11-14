import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DB_TIMEOUTS,
  WORKER_DB_TIMEOUTS,
  dbTimeoutOptions,
  isDbTimeoutError,
} from '../src/db-timeouts.ts'

describe('dbTimeoutOptions', () => {
  it('builds the startup options', () => {
    expect(dbTimeoutOptions(DEFAULT_DB_TIMEOUTS)).toBe(
      '-c statement_timeout=30000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=60000',
    )
  })
  it('gives the worker more room than the web', () => {
    expect(WORKER_DB_TIMEOUTS.statementMs).toBeGreaterThan(DEFAULT_DB_TIMEOUTS.statementMs)
  })
  it('rejects values that are not positive integers (also stops option injection)', () => {
    expect(() => dbTimeoutOptions({ ...DEFAULT_DB_TIMEOUTS, lockMs: 0 })).toThrow()
    expect(() => dbTimeoutOptions({ ...DEFAULT_DB_TIMEOUTS, statementMs: 1.5 })).toThrow()
    expect(() =>
      dbTimeoutOptions({ ...DEFAULT_DB_TIMEOUTS, statementMs: '1 -c x=1' as unknown as number }),
    ).toThrow()
  })
})

describe('isDbTimeoutError', () => {
  it('recognizes the three time-limit SQLSTATEs, also wrapped', () => {
    for (const code of ['57014', '55P03', '25P03']) {
      expect(isDbTimeoutError({ code })).toBe(true)
      expect(isDbTimeoutError(new Error('x', { cause: { code } }))).toBe(true)
      expect(isDbTimeoutError({ meta: { code } })).toBe(true)
    }
  })
  it('ignores other errors', () => {
    expect(isDbTimeoutError(new Error('boom'))).toBe(false)
    expect(isDbTimeoutError({ code: '23505' })).toBe(false)
    expect(isDbTimeoutError(null)).toBe(false)
    expect(isDbTimeoutError('57014')).toBe(false)
  })
})
