import { Prisma, type Subscription, type TenantTx } from '@saas/database'
import { nowOf, type BaseCtx } from '../../context.ts'
import { writeAudit } from '../audit/index.ts'
import { emitEvent } from '../events/index.ts'
import { CATALOG, planVersionOf, type Catalog, type PlanVersion } from './catalog.ts'
import { addInterval, periodContaining, type Period } from './periods.ts'
import { usageOf } from './usage.ts'

const Decimal = Prisma.Decimal
type Decimal = Prisma.Decimal

/** SUPUESTO: usage arriving up to 1 hour after the period end still counts for it. */
export const LATE_USAGE_GRACE_MS = 60 * 60 * 1000

export interface OverageLine {
  metric: string
  unit: string
  used: Decimal
  included: Decimal | null
  overageUnits: Decimal
  unitPrice: Decimal
  amount: Decimal
}

/** Overage of each metric (soft limits only), rounded to cents per line (half up). */
export function overageOf(
  plan: PlanVersion,
  usage: Map<string, Decimal>,
  catalog: Catalog = CATALOG,
): { lines: OverageLine[]; total: Decimal } {
  const lines = catalog.metrics.map((m) => {
    const quota = plan.quotas[m.key]!
    const used = usage.get(m.key) ?? new Decimal(0)
    const included = quota.included === null ? null : new Decimal(quota.included)
    const chargeable = quota.limit === 'soft' && included !== null
    const overageUnits = chargeable ? Decimal.max(0, used.minus(included)) : new Decimal(0)
    const unitPrice = new Decimal(quota.overagePrice ?? 0)
    const amount = overageUnits.mul(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    return { metric: m.key, unit: m.unit, used, included, overageUnits, unitPrice, amount }
  })
  return { lines, total: lines.reduce((sum, l) => sum.plus(l.amount), new Decimal(0)) }
}

/** What will be charged: the overage, limited by the spend cap if there is one. */
export const amountDueOf = (overage: Decimal, spendCap: Decimal | null) =>
  spendCap === null ? overage : Decimal.min(overage, spendCap)

/**
 * Periods of a subscription that have ended (plus the late-usage grace) and may still be
 * unclosed. With an hourly schedule, that is the previous period; a canceled subscription
 * closes its last stored period.
 */
export function duePeriods(sub: Subscription, plan: PlanVersion, now: Date): Period[] {
  const cutoff = new Date(now.getTime() - LATE_USAGE_GRACE_MS)
  const stored = { start: sub.currentPeriodStart, end: sub.currentPeriodEnd }
  if (sub.status === 'CANCELED') return stored.end <= cutoff ? [stored] : []
  const current = periodContaining(stored, plan.interval, cutoff)
  const previous = { start: addInterval(current.start, plan.interval, -1), end: current.start }
  // The subscription did not exist during that period.
  if (previous.end <= sub.createdAt) return []
  return [previous]
}

/**
 * Closes the due periods of the organization's subscription, once each (ADR 0012): computes
 * usage and overage, stores the immutable snapshot, audits it and emits an event. Charging
 * the amount due is the payment provider's job (B3).
 */
export async function closeDuePeriods(
  ctx: BaseCtx,
  tx: TenantTx,
  organizationId: string,
  catalog: Catalog = CATALOG,
) {
  const sub = await tx.subscription.findUnique({ where: { organizationId } })
  if (!sub) return []
  const plan = planVersionOf(catalog, sub.planKey, sub.planVersion)
  const now = nowOf(ctx)
  const closed = []
  for (const period of duePeriods(sub, plan, now)) {
    const exists = await tx.billingPeriod.findUnique({
      where: {
        organizationId_subscriptionId_periodStart: {
          organizationId,
          subscriptionId: sub.id,
          periodStart: period.start,
        },
      },
      select: { id: true },
    })
    if (exists) continue
    const usage = await usageOf(tx, organizationId, catalog.metrics, period)
    const { lines, total } = overageOf(plan, usage, catalog)
    const amountDue = amountDueOf(total, sub.spendCap)
    const record = await tx.billingPeriod.create({
      data: {
        organizationId,
        subscriptionId: sub.id,
        planKey: plan.plan,
        planVersion: plan.version,
        currency: plan.currency,
        periodStart: period.start,
        periodEnd: period.end,
        fixedPrice: new Decimal(plan.price),
        overageTotal: total,
        spendCap: sub.spendCap,
        amountDue,
        status: amountDue.gt(0) ? 'PENDING_CHARGE' : 'NO_CHARGE',
        closedAt: now,
        lines: {
          // organization_id comes from the period (composite relation).
          create: lines.map((l) => ({
            metric: l.metric,
            unit: l.unit,
            used: l.used,
            included: l.included,
            overageUnits: l.overageUnits,
            unitPrice: l.unitPrice,
            amount: l.amount,
          })),
        },
      },
    })
    await writeAudit(tx, {
      organizationId,
      actorUserId: null,
      action: 'billing.period_closed',
      resourceType: 'billing_period',
      resourceId: record.id,
      after: {
        periodStart: period.start.toISOString(),
        overageTotal: total.toString(),
        amountDue: amountDue.toString(),
      },
      correlationId: ctx.correlationId,
    })
    await emitEvent(ctx, tx, {
      type: 'billing.period_closed',
      organizationId,
      subjectId: record.id,
      data: {
        organizationId,
        periodId: record.id,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        plan: `${plan.plan}@${plan.version}`,
        currency: plan.currency,
        amountDue: amountDue.toString(),
      },
    })
    closed.push(record)
  }
  return closed
}
