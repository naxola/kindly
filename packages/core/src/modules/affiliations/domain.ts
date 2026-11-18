/**
 * Pure affiliation rules: no database, unit-testable without Postgres.
 */

export interface AffiliationFeeInput {
  status: 'ACTIVE' | 'INACTIVE'
  /** First day of the last paid month, or null if no fee was ever recorded. */
  feePaidUntil: Date | null
}

const monthStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)

/**
 * "Fee overdue": a fixed rule, never an AI inference. ACTIVE and paid through a month before the
 * current one. Never while INACTIVE (leaving is its own warning) or with no fee ever recorded:
 * there is nothing to be behind on until one has been logged.
 */
export function isFeeOverdue(a: AffiliationFeeInput, now: Date = new Date()): boolean {
  if (a.status !== 'ACTIVE' || !a.feePaidUntil) return false
  return monthStart(a.feePaidUntil) < monthStart(now)
}

/** First unpaid month: the one right after `feePaidUntil`. */
export function firstUnpaidMonth(feePaidUntil: Date): Date {
  return new Date(Date.UTC(feePaidUntil.getUTCFullYear(), feePaidUntil.getUTCMonth() + 1, 1))
}
