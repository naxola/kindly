import { Prisma, type Subscription, type TenantTx } from '@saas/database'
import { nowOf, type BaseCtx } from '../../context.ts'
import { writeAudit } from '../audit/index.ts'
import { emitEvent } from '../events/index.ts'
import { CATALOG, planVersionOf, type Catalog, type PlanVersion } from './catalog.ts'
import { addInterval, type Period } from './periods.ts'
import { chargePeriodJob } from './jobs.ts'
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

/** A billing period of a subscription with the plan version that governed it. */
export interface DuePeriod extends Period {
  planKey: string
  planVersion: number
}

/**
 * Periods of a subscription that have ended (plus the late-usage grace) and are not closed yet
 * (ADR 0014). Every period counts, not only the previous one: with the worker down for several
 * periods, all of them are returned, oldest first, each with the plan that governed it.
 *
 * - `history`: the stored plan of each period (`subscription_periods`).
 * - `closedStarts`: start instants (ms) of the periods already closed.
 * - Periods the provider has not announced yet (renewal webhook late or lost) are extrapolated
 *   from the last known end with the last known plan. A canceled subscription has no more.
 * - Without any history or closed period (a legacy subscription), the periods before the stored
 *   one that started after the subscription was created are added.
 * The grace is applied to every period's own end: a renewal arriving early never closes the
 * period that has just ended before its grace is over.
 */
export function duePeriods(
  sub: Pick<
    Subscription,
    'status' | 'createdAt' | 'currentPeriodStart' | 'currentPeriodEnd' | 'planKey' | 'planVersion'
  >,
  now: Date,
  {
    history = [],
    closedStarts = new Set<number>(),
    catalog = CATALOG,
  }: { history?: DuePeriod[]; closedStarts?: Set<number>; catalog?: Catalog } = {},
): DuePeriod[] {
  const cutoff = new Date(now.getTime() - LATE_USAGE_GRACE_MS)
  const intervalOf = (p: DuePeriod) => planVersionOf(catalog, p.planKey, p.planVersion).interval
  const byStart = new Map<number, DuePeriod>()
  for (const h of history) byStart.set(h.start.getTime(), h)
  // The subscription row is the latest word on the current period.
  byStart.set(sub.currentPeriodStart.getTime(), {
    start: sub.currentPeriodStart,
    end: sub.currentPeriodEnd,
    planKey: sub.planKey,
    planVersion: sub.planVersion,
  })
  const known = [...byStart.values()].sort((x, y) => x.start.getTime() - y.start.getTime())

  if (history.length === 0 && closedStarts.size === 0) {
    const first = known[0]!
    for (let n = 1; ; n++) {
      const interval = intervalOf(first)
      const end = n === 1 ? first.start : addInterval(first.start, interval, -(n - 1))
      if (end <= sub.createdAt) break // the subscription did not exist during that period
      known.unshift({ ...first, start: addInterval(first.start, interval, -n), end })
    }
  }

  const periods = [...known]
  if (sub.status !== 'CANCELED') {
    const last = known[known.length - 1]!
    const interval = intervalOf(last)
    for (let n = 1; ; n++) {
      const end = addInterval(last.end, interval, n)
      if (end > cutoff) break
      const start = n === 1 ? last.end : addInterval(last.end, interval, n - 1)
      periods.push({ ...last, start, end })
    }
  }
  return periods.filter((p) => p.end <= cutoff && !closedStarts.has(p.start.getTime()))
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
  const now = nowOf(ctx)
  const history = await tx.subscriptionPeriod.findMany({ where: { subscriptionId: sub.id } })
  const closedRows = await tx.billingPeriod.findMany({
    where: { subscriptionId: sub.id },
    select: { periodStart: true },
  })
  const due = duePeriods(sub, now, {
    history: history.map((h) => ({
      start: h.periodStart,
      end: h.periodEnd,
      planKey: h.planKey,
      planVersion: h.planVersion,
    })),
    closedStarts: new Set(closedRows.map((r) => r.periodStart.getTime())),
    catalog,
  })
  const closed = []
  for (const period of due) {
    // The plan that governed THAT period, not the current one.
    const plan = planVersionOf(catalog, period.planKey, period.planVersion)
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
    if (amountDue.gt(0) && sub.provider) {
      await ctx.queue.enqueue(
        tx,
        chargePeriodJob,
        { organizationId, periodId: record.id },
        { organizationId, correlationId: ctx.correlationId, idempotencyKey: `charge:${record.id}` },
      )
    }
    closed.push(record)
  }
  return closed
}
