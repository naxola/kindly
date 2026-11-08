import { Prisma, type TenantTx } from '@saas/database'
import { z } from 'zod'
import { nowOf, type BaseCtx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { emitEvent } from '../events/index.ts'
import { CATALOG, metricOf, type Catalog, type MetricDef, type Quota } from './catalog.ts'
import { quotaAlertEmailJob } from './jobs.ts'
import type { Period } from './periods.ts'
import { billingStateOf } from './state.ts'

const Decimal = Prisma.Decimal
type Decimal = Prisma.Decimal

/** Percentages of a quota that trigger a notice (once per period, metric and threshold). */
export const QUOTA_THRESHOLDS = [80, 100] as const

/** Usage of each metric in a period, aggregated as the catalog says. */
export async function usageOf(
  tx: TenantTx,
  organizationId: string,
  metrics: readonly MetricDef[],
  period: Period,
): Promise<Map<string, Decimal>> {
  const result = new Map<string, Decimal>(metrics.map((m) => [m.key, new Decimal(0)]))
  const keysOf = (a: MetricDef['aggregation']) =>
    metrics.filter((m) => m.aggregation === a).map((m) => m.key)
  const where = (keys: string[]) => Prisma.sql`
    WHERE organization_id = ${organizationId}::uuid AND metric = ANY(${keys}::text[])
      AND occurred_at >= ${period.start} AND occurred_at < ${period.end}`
  const queries: [string[], Prisma.Sql][] = [
    [keysOf('sum'), Prisma.sql`SUM(quantity)`],
    [keysOf('max'), Prisma.sql`MAX(quantity)`],
    [keysOf('unique'), Prisma.sql`COUNT(DISTINCT subject_key)::numeric`],
  ]
  for (const [keys, agg] of queries) {
    if (keys.length === 0) continue
    const rows = await tx.$queryRaw<{ metric: string; value: Decimal | null }[]>`
      SELECT metric, ${agg} AS value FROM usage_events ${where(keys)} GROUP BY metric`
    for (const r of rows) result.set(r.metric, new Decimal(r.value ?? 0))
  }
  return result
}

export const RecordUsageInput = z.object({
  organizationId: z.uuid(),
  metric: z.string().min(1),
  /** Positive decimal: for `max` metrics, the current sample (e.g. GB stored now). */
  quantity: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d+)?$/)]),
  /** One usage per business effect: retries never count twice. */
  idempotencyKey: z.string().min(1).max(200),
  /** Required for `unique` metrics (what is counted once per period). */
  subjectKey: z.string().min(1).max(200).optional(),
  occurredAt: z.date().optional(),
})
export type RecordUsageInput = z.input<typeof RecordUsageInput>

export interface RecordUsageResult {
  recorded: boolean
  /** Usage of the period after this event. */
  used: Decimal
  quota: Quota
}

/**
 * Records usage inside the transaction of the business effect it measures (ADR 0012). With
 * a hard limit it rejects the effect (QUOTA_EXCEEDED) instead of recording beyond the quota,
 * so the caller's whole transaction rolls back. Serialized per organization and metric.
 */
export async function recordUsage(
  ctx: BaseCtx,
  tx: TenantTx,
  input: RecordUsageInput,
  catalog: Catalog = CATALOG,
): Promise<RecordUsageResult> {
  const data = RecordUsageInput.parse(input)
  const metric = metricOf(catalog, data.metric)
  if (metric.aggregation === 'unique' && !data.subjectKey) {
    throw new Error(`Metric '${metric.key}' counts unique subjects: subjectKey is required`)
  }
  const quantity = new Decimal(data.quantity)
  const occurredAt = data.occurredAt ?? nowOf(ctx)

  // Concurrent records of the same metric would both pass the quota check.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`usage:${data.organizationId}:${metric.key}`}, 0))`

  const state = await billingStateOf(tx, data.organizationId, occurredAt, catalog)
  const quota = state.plan.quotas[metric.key]!
  const used = (await usageOf(tx, data.organizationId, [metric], state.period)).get(metric.key)!

  const duplicate = await tx.usageEvent.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: data.organizationId,
        idempotencyKey: data.idempotencyKey,
      },
    },
    select: { id: true },
  })
  if (duplicate) return { recorded: false, used, quota }

  let next: Decimal
  if (metric.aggregation === 'sum') next = used.plus(quantity)
  else if (metric.aggregation === 'max') next = Decimal.max(used, quantity)
  else {
    const seen = await tx.usageEvent.findFirst({
      where: {
        organizationId: data.organizationId,
        metric: metric.key,
        subjectKey: data.subjectKey!,
        occurredAt: { gte: state.period.start, lt: state.period.end },
      },
      select: { id: true },
    })
    next = seen ? used : used.plus(1)
  }

  if (quota.included !== null && quota.limit === 'hard' && next.gt(quota.included)) {
    throw new DomainError('QUOTA_EXCEEDED', `Quota of ${metric.key} exceeded`, [
      { code: 'QUOTA_EXCEEDED', path: metric.key },
    ])
  }

  await tx.usageEvent.create({
    data: {
      organizationId: data.organizationId,
      metric: metric.key,
      quantity,
      subjectKey: data.subjectKey ?? null,
      occurredAt,
      idempotencyKey: data.idempotencyKey,
    },
  })

  if (quota.included !== null && new Decimal(quota.included).gt(0)) {
    const included = new Decimal(quota.included)
    for (const threshold of QUOTA_THRESHOLDS) {
      const limit = included.mul(threshold).div(100)
      if (used.lt(limit) && next.gte(limit)) {
        const subjectId = `${data.organizationId}:${metric.key}:${state.period.start.toISOString()}:${threshold}`
        await emitEvent(ctx, tx, {
          type: 'usage.threshold_reached',
          organizationId: data.organizationId,
          subjectId,
          data: {
            organizationId: data.organizationId,
            metric: metric.key,
            threshold,
            used: next.toString(),
            included: included.toString(),
            periodStart: state.period.start.toISOString(),
          },
        })
        await ctx.queue.enqueue(
          tx,
          quotaAlertEmailJob,
          {
            organizationId: data.organizationId,
            metric: metric.key,
            unit: metric.unit,
            threshold,
            used: next.toString(),
            included: included.toString(),
            hardLimit: quota.limit === 'hard',
            url: `${ctx.appUrl}/settings/billing`,
          },
          {
            organizationId: data.organizationId,
            correlationId: ctx.correlationId,
            idempotencyKey: `quota-alert:${subjectId}`,
          },
        )
      }
    }
  }
  return { recorded: true, used: next, quota }
}
