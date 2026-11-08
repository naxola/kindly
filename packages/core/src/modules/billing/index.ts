// Billing (ADR 0012): plan catalog, entitlements and metered usage. Charging (payment
// provider, period close) is added in later phases behind the same public API.
export {
  AGGREGATIONS,
  CATALOG,
  defineCatalog,
  defaultPlanOf,
  metricOf,
  planVersionOf,
  publicPlans,
} from './catalog.ts'
export type { Aggregation, Catalog, MetricDef, PlanVersion, Quota } from './catalog.ts'
export { addInterval, calendarMonth, periodContaining } from './periods.ts'
export type { Period } from './periods.ts'
export { billingStateOf } from './state.ts'
export type { BillingState } from './state.ts'
export { QUOTA_THRESHOLDS, RecordUsageInput, recordUsage, usageOf } from './usage.ts'
export type { RecordUsageResult } from './usage.ts'
export { hasFeature, requireFeature } from './entitlements.ts'
export { getBillingOverview, listPlans } from './overview.ts'
export { quotaAlertEmailJob, billingEmailHandlers } from './jobs.ts'
export { quotaAlertEmail } from './emails.ts'
