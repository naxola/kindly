import type { Prisma, SubscriptionStatus, TenantTx } from '@saas/database'
import { CATALOG, defaultPlanOf, planVersionOf, type Catalog, type PlanVersion } from './catalog.ts'
import { calendarMonth, periodContaining, type Period } from './periods.ts'

/** SUPUESTO: days a PAST_DUE subscription keeps its plan before falling back to the default. */
export const PAYMENT_GRACE_DAYS = 7

/** What an organization has right now: plan version, status and current period. */
export interface BillingState {
  organizationId: string
  plan: PlanVersion
  /** DEFAULT: no (live) subscription, the catalog's default plan applies. */
  status: SubscriptionStatus | 'DEFAULT'
  period: Period
  cancelAtPeriodEnd: boolean
  spendCap: Prisma.Decimal | null
  subscriptionId: string | null
  /** Payment overdue beyond the grace period: the default plan applies until it is paid. */
  restricted: boolean
}

export async function billingStateOf(
  tx: TenantTx,
  organizationId: string,
  now: Date,
  catalog: Catalog = CATALOG,
): Promise<BillingState> {
  const sub = await tx.subscription.findUnique({ where: { organizationId } })
  if (!sub || sub.status === 'CANCELED') {
    return {
      organizationId,
      plan: defaultPlanOf(catalog),
      status: 'DEFAULT',
      period: calendarMonth(now),
      cancelAtPeriodEnd: false,
      spendCap: null,
      subscriptionId: null,
      restricted: false,
    }
  }
  const subscribed = planVersionOf(catalog, sub.planKey, sub.planVersion)
  const restricted =
    sub.status === 'PAST_DUE' &&
    sub.pastDueSince !== null &&
    now.getTime() - sub.pastDueSince.getTime() > PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000
  // The period keeps the subscription's cadence; only the entitlements fall back.
  const plan = restricted ? defaultPlanOf(catalog) : subscribed
  return {
    organizationId,
    plan,
    restricted,
    status: sub.status,
    period: periodContaining(
      { start: sub.currentPeriodStart, end: sub.currentPeriodEnd },
      subscribed.interval,
      now,
    ),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    spendCap: sub.spendCap,
    subscriptionId: sub.id,
  }
}
