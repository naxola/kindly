/**
 * Pure membership rules — no DB import, so they're unit-testable without
 * PostgreSQL, same shape as `messaging/domain.ts::describeAccountStatus`.
 */

export interface MembershipFeeInput {
  status: "ACTIVE" | "INACTIVE";
  /** First day of the last paid month, ISO date (YYYY-MM-DD), or null if never recorded. */
  feePaidUntil: string | null;
}

/**
 * "Cuota pendiente" (`docs/ui/CONVERSATION_WORKSPACE.md` §5.1): a fixed
 * rule, never a suggestion from the AI — ACTIVE and paid through a month
 * before the current one. Always false while INACTIVE (baja is its own,
 * separate warning) or with no fee ever recorded: there's nothing to be
 * behind on until a fee has been logged once.
 */
export function isFeeOverdue(membership: MembershipFeeInput, now: Date = new Date()): boolean {
  if (membership.status !== "ACTIVE" || !membership.feePaidUntil) {
    return false;
  }
  const paidUntil = new Date(membership.feePaidUntil);
  const currentMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const paidMonthStart = Date.UTC(paidUntil.getUTCFullYear(), paidUntil.getUTCMonth(), 1);
  return paidMonthStart < currentMonthStart;
}

/** The first unpaid month, for the "cuota de <mes> pendiente" copy — the month right after `feePaidUntil`. */
export function firstUnpaidMonth(feePaidUntil: string): Date {
  const paidUntil = new Date(feePaidUntil);
  return new Date(Date.UTC(paidUntil.getUTCFullYear(), paidUntil.getUTCMonth() + 1, 1));
}
