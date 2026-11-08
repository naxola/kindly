import { Prisma, withTenant } from '@saas/database'
import { nowOf, type Ctx } from '../../context.ts'
import { authorize } from '../identity/index.ts'
import { CATALOG, publicPlans, type Catalog, type PlanVersion } from './catalog.ts'
import { billingStateOf } from './state.ts'
import { usageOf } from './usage.ts'

const planView = (p: PlanVersion) => ({
  key: p.plan,
  version: p.version,
  interval: p.interval,
  currency: p.currency,
  price: p.price,
  features: [...p.features],
})

/** Plan, period and usage of the active organization, for the billing screen. */
export async function getBillingOverview(ctx: Ctx, catalog: Catalog = CATALOG) {
  authorize(ctx.actor, 'billing.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const state = await billingStateOf(tx, ctx.actor.organizationId, nowOf(ctx), catalog)
    const usage = await usageOf(tx, state.organizationId, catalog.metrics, state.period)
    return {
      plan: planView(state.plan),
      status: state.status,
      period: state.period,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      spendCap: state.spendCap?.toString() ?? null,
      metrics: catalog.metrics.map((m) => {
        const quota = state.plan.quotas[m.key]!
        const used = usage.get(m.key)!
        const included = quota.included === null ? null : new Prisma.Decimal(quota.included)
        return {
          key: m.key,
          unit: m.unit,
          used: used.toString(),
          included: included?.toString() ?? null,
          limit: quota.limit,
          overagePrice: quota.overagePrice ?? null,
          /** Share of the quota used (0–100+); null when unlimited or nothing included. */
          percent:
            included && included.gt(0)
              ? used.div(included).mul(100).toDecimalPlaces(1).toNumber()
              : null,
        }
      }),
    }
  })
}

/** Plans a new customer can choose (latest public version of each). */
export function listPlans(catalog: Catalog = CATALOG) {
  return publicPlans(catalog).map((p) => ({
    ...planView(p),
    quotas: Object.entries(p.quotas).map(([metric, q]) => ({
      metric,
      included: q.included,
      limit: q.limit,
      overagePrice: q.overagePrice ?? null,
    })),
  }))
}
