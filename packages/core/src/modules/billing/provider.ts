/**
 * Payment provider port (ADR 0012). The adapter (packages/adapters/payments) talks to the
 * provider; core only sees these normalized shapes. Amounts are decimal strings.
 */
export type ProviderSubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED'

export interface ProviderSubscription {
  /** Subscription id at the provider (e.g. sub_…). */
  ref: string
  customerRef: string
  status: ProviderSubscriptionStatus
  /** Provider price of the plan: maps to a catalog version (`providerPriceId`). */
  priceId: string
  periodStart: Date | null
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean
  /** Our organization id, sent at checkout as custom data. Null if missing. */
  organizationId: string | null
}

export type ProviderEvent =
  | { id: string; occurredAt: Date; kind: 'subscription'; subscription: ProviderSubscription }
  /** Verified but irrelevant for billing state (logged and acknowledged). */
  | { id: string; occurredAt: Date; kind: 'ignored'; type: string }

export interface CheckoutSession {
  provider: string
  /** What the browser needs to open the provider checkout (e.g. Paddle.js). */
  environment: 'sandbox' | 'production'
  clientToken: string
  priceId: string
  customData: Record<string, string>
  customerEmail: string | null
}

export interface OverageCharge {
  subscriptionRef: string
  /** Decimal string in the currency's major unit (e.g. "12.34"). */
  amount: string
  currency: 'EUR' | 'USD'
  description: string
  /** Our billing period id, stored with the charge at the provider for reconciliation. */
  periodId: string
}

export interface PaymentProvider {
  readonly name: string
  checkout(input: {
    priceId: string
    organizationId: string
    customerEmail: string | null
  }): CheckoutSession
  portalUrl(input: { customerRef: string; subscriptionRef: string | null }): Promise<string>
  /**
   * Adds a one-off charge to the subscription's next bill. NOT idempotent at the provider:
   * callers never retry it automatically (ADR 0012).
   */
  chargeOverage(charge: OverageCharge): Promise<void>
  /** Verifies the signature (throws if invalid or stale) and normalizes the event. */
  parseWebhook(rawBody: string, headers: Headers, now: Date): ProviderEvent
}

export class InvalidWebhookError extends Error {
  constructor(reason: string) {
    super(`Invalid webhook: ${reason}`)
    this.name = 'InvalidWebhookError'
  }
}
