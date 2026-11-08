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
export { PAYMENT_GRACE_DAYS, billingStateOf } from './state.ts'
export type { BillingState } from './state.ts'
export { QUOTA_THRESHOLDS, RecordUsageInput, recordUsage, usageOf } from './usage.ts'
export type { RecordUsageResult } from './usage.ts'
export { hasFeature, requireFeature } from './entitlements.ts'
export { getBillingOverview, listPlans } from './overview.ts'
export {
  quotaAlertEmailJob,
  billingEmailHandlers,
  closeDuePeriodsScanJob,
  closePeriodsJob,
  billingCloseHandlers,
  BILLING_SCHEDULES,
  chargePeriodJob,
  billingChargeHandler,
  ProviderEventPayload,
  providerEventPayload,
  providerEventJob,
  providerEventHandler,
} from './jobs.ts'
export type { BillingJobDeps } from './jobs.ts'
export {
  LATE_USAGE_GRACE_MS,
  amountDueOf,
  closeDuePeriods,
  duePeriods,
  overageOf,
} from './close.ts'
export type { OverageLine } from './close.ts'
export { SetSpendCapInput, listBillingPeriods, setSpendCap } from './manage.ts'
export { quotaAlertEmail } from './emails.ts'
export { InvalidWebhookError } from './provider.ts'
export type {
  CheckoutSession,
  OverageCharge,
  PaymentProvider,
  ProviderEvent,
  ProviderSubscription,
  ProviderSubscriptionStatus,
} from './provider.ts'
export {
  StartCheckoutInput,
  applyProviderEvent,
  customerPortalUrl,
  startCheckout,
} from './subscriptions.ts'
