/**
 * Postgres time limits applied to every connection of a process (R2.2). They live in the
 * connection (the `options` startup parameter), not in `ALTER ROLE`: `app_migrator` cannot
 * alter roles, and the limit should follow the process, not the role. `app_migrator` (the
 * migrations) gets none.
 */
export interface DbTimeouts {
  /** A single statement running longer is cancelled (SQLSTATE 57014). */
  statementMs: number
  /** Waiting for a lock longer fails the statement (SQLSTATE 55P03). */
  lockMs: number
  /** A transaction left idle longer is terminated with its connection (SQLSTATE 25P03). */
  idleInTransactionMs: number
}

/** Request/response processes (web): short, so a stuck query does not hold a pooled connection. */
export const DEFAULT_DB_TIMEOUTS: DbTimeouts = {
  statementMs: 30_000,
  lockMs: 5_000,
  idleInTransactionMs: 60_000,
}

/** Worker: period close and queue maintenance need more room, and may wait for advisory locks. */
export const WORKER_DB_TIMEOUTS: DbTimeouts = {
  statementMs: 120_000,
  lockMs: 30_000,
  idleInTransactionMs: 120_000,
}

/** Value of the `options` connection parameter that applies the limits. */
export function dbTimeoutOptions(timeouts: DbTimeouts): string {
  for (const value of Object.values(timeouts)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('Database time limits must be positive integers (milliseconds)')
    }
  }
  return [
    `-c statement_timeout=${timeouts.statementMs}`,
    `-c lock_timeout=${timeouts.lockMs}`,
    `-c idle_in_transaction_session_timeout=${timeouts.idleInTransactionMs}`,
  ].join(' ')
}

/** Postgres errors that mean "a time limit was hit" (a retry may work; the request failed). */
const TIMEOUT_SQLSTATES = new Set(['57014', '55P03', '25P03'])

/** Walks `cause` chains (Prisma wraps the driver error) looking for a time-limit SQLSTATE. */
export function isDbTimeoutError(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    if (typeof e !== 'object') return false
    const obj = e as { code?: unknown; cause?: unknown; meta?: { code?: unknown } }
    for (const code of [obj.code, obj.meta?.code]) {
      if (typeof code === 'string' && TIMEOUT_SQLSTATES.has(code)) return true
    }
    e = obj.cause
  }
  return false
}
