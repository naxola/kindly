import type { Prisma, SubscriptionStatus, TenantTx } from '@saas/database'
import { CATALOG, defaultPlanOf, planVersionOf, type Catalog, type PlanVersion } from './catalog.ts'
import { calendarMonth, periodContaining, type Period } from './periods.ts'

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
    }
  }
  const plan = planVersionOf(catalog, sub.planKey, sub.planVersion)
  return {
    organizationId,
    plan,
    status: sub.status,
    period: periodContaining(
      { start: sub.currentPeriodStart, end: sub.currentPeriodEnd },
      plan.interval,
      now,
    ),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    spendCap: sub.spendCap,
    subscriptionId: sub.id,
  }
}
