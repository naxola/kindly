/**
 * Delegate proposal for a new affiliate (pure, no I/O): the delegate who
 * carries the fewest affiliates, where load counts both the affiliates
 * already assigned and the proposals still waiting for the admin — so
 * several altas arriving together spread out instead of piling on one
 * person. Ties follow a fixed order (the order of `delegates`, which the
 * caller sorts by when each joined the organization).
 */

export interface DelegateLoad {
  userId: string;
  name: string;
  /** Contacts the delegate currently answers for. */
  assigned: number;
  /** Pending altas whose proposal points at this delegate. */
  pending: number;
}

export function totalLoad(delegate: Pick<DelegateLoad, "assigned" | "pending">): number {
  return delegate.assigned + delegate.pending;
}

/** The delegate to propose, or null when the organization has none. */
export function proposeDelegate(delegates: DelegateLoad[]): string | null {
  let best: DelegateLoad | null = null;
  for (const delegate of delegates) {
    if (best === null || totalLoad(delegate) < totalLoad(best)) best = delegate;
  }
  return best?.userId ?? null;
}
