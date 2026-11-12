import { Prisma } from '@saas/database'

/**
 * Plan catalog (ADR 0012), defined in code and versioned. A published version is never
 * edited: changing a price means a new version, and existing subscriptions keep theirs.
 * Each product replaces CATALOG with its own metrics, features and plans. The template
 * ships only a free plan without metrics: it never invents prices.
 */
export const AGGREGATIONS = ['sum', 'max', 'unique'] as const
export type Aggregation = (typeof AGGREGATIONS)[number]

export interface MetricDef {
  /** Stable key, e.g. `api_calls`. */
  key: string
  /** Unit shown to the customer, e.g. `calls`, `GB`, `users`. */
  unit: string
  /**
   * sum: add every quantity (calls). max: highest sample of the period (storage).
   * unique: distinct `subjectKey`s in the period (active users).
   */
  aggregation: Aggregation
}

export interface Quota {
  /** Included per period, as a decimal string. Null = unlimited. */
  included: string | null
  /** hard: actions beyond the quota are rejected. soft: allowed and charged as overage. */
  limit: 'hard' | 'soft'
  /** Price per unit beyond the quota (soft limits only), in the plan currency. */
  overagePrice?: string
}

export interface PlanVersion {
  plan: string
  version: number
  interval: 'month' | 'year'
  currency: 'EUR' | 'USD'
  /** Fixed price per interval, decimal string ("0" for free plans). */
  price: string
  features: readonly string[]
  /** One entry per metric of the catalog: nothing is implicit. */
  quotas: Readonly<Record<string, Quota>>
  /** Offered to new customers. Old versions stay for existing subscriptions. */
  public: boolean
  /** Price id at the payment provider (B3). Null for free plans. */
  providerPriceId?: string | null
}

export interface Catalog {
  metrics: readonly MetricDef[]
  features: readonly string[]
  plans: readonly PlanVersion[]
  /** Plan of every organization without a subscription. Must be free. */
  defaultPlan: { plan: string; version: number }
}

const DECIMAL = /^\d+(\.\d+)?$/

/** Validates a catalog once, at module load: a broken catalog fails at startup and in tests. */
export function defineCatalog(catalog: Catalog): Catalog {
  const errors: string[] = []
  const metricKeys = new Set<string>()
  for (const m of catalog.metrics) {
    if (metricKeys.has(m.key)) errors.push(`duplicated metric ${m.key}`)
    metricKeys.add(m.key)
  }
  const features = new Set(catalog.features)
  const versions = new Set<string>()
  for (const p of catalog.plans) {
    const id = `${p.plan}@${p.version}`
    if (versions.has(id)) errors.push(`duplicated plan version ${id}`)
    versions.add(id)
    if (!DECIMAL.test(p.price)) errors.push(`${id}: invalid price`)
    for (const f of p.features) if (!features.has(f)) errors.push(`${id}: unknown feature ${f}`)
    for (const key of metricKeys) {
      const q = p.quotas[key]
      if (!q) {
        errors.push(`${id}: missing quota for ${key}`)
        continue
      }
      if (q.included !== null && !DECIMAL.test(q.included)) errors.push(`${id}: ${key} included`)
      if (q.limit === 'soft' && (!q.overagePrice || !DECIMAL.test(q.overagePrice))) {
        errors.push(`${id}: ${key} soft limit needs an overage price`)
      }
      if (q.limit === 'hard' && q.overagePrice) errors.push(`${id}: ${key} hard limit with price`)
    }
    for (const key of Object.keys(p.quotas)) {
      if (!metricKeys.has(key)) errors.push(`${id}: quota for unknown metric ${key}`)
    }
  }
  const def = catalog.plans.find(
    (p) => p.plan === catalog.defaultPlan.plan && p.version === catalog.defaultPlan.version,
  )
  if (!def) errors.push('default plan not in the catalog')
  else if (!new Prisma.Decimal(def.price).isZero()) errors.push('default plan must be free')
  if (errors.length) throw new Error(`Invalid billing catalog:\n  - ${errors.join('\n  - ')}`)
  return catalog
}

export function planVersionOf(catalog: Catalog, plan: string, version: number): PlanVersion {
  const found = catalog.plans.find((p) => p.plan === plan && p.version === version)
  if (!found) throw new Error(`Plan ${plan}@${version} is not in the catalog`)
  return found
}

export const defaultPlanOf = (catalog: Catalog) =>
  planVersionOf(catalog, catalog.defaultPlan.plan, catalog.defaultPlan.version)

export function metricOf(catalog: Catalog, key: string): MetricDef {
  const metric = catalog.metrics.find((m) => m.key === key)
  if (!metric) throw new Error(`Unknown billing metric '${key}'`)
  return metric
}

/** Latest public version of each plan: what a new customer can choose. */
export function publicPlans(catalog: Catalog): PlanVersion[] {
  const latest = new Map<string, PlanVersion>()
  for (const p of catalog.plans) {
    if (!p.public) continue
    const current = latest.get(p.plan)
    if (!current || p.version > current.version) latest.set(p.plan, p)
  }
  return [...latest.values()]
}

/** SUPUESTO: the template only knows a free plan. Each product defines its catalog here. */
export const CATALOG: Catalog = defineCatalog({
  metrics: [],
  features: [],
  plans: [
    {
      plan: 'free',
      version: 1,
      interval: 'month',
      currency: 'EUR',
      price: '0',
      features: [],
      quotas: {},
      public: true,
      providerPriceId: null,
    },
  ],
  defaultPlan: { plan: 'free', version: 1 },
})
