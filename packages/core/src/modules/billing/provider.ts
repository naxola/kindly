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
  /** Our organization id, attached by the server when it created the checkout. Null if missing. */
  organizationId: string | null
}

export type ProviderEvent =
  | { id: string; occurredAt: Date; kind: 'subscription'; subscription: ProviderSubscription }
  /** Verified but irrelevant for billing state (logged and acknowledged). */
  | { id: string; occurredAt: Date; kind: 'ignored'; type: string }

/**
 * What the browser needs to open the provider checkout (e.g. Paddle.js). The transaction is
 * created by the server (ADR 0014), already bound to the organization: the browser never
 * says whose purchase it is.
 */
export interface CheckoutSession {
  provider: string
  environment: 'sandbox' | 'production'
  clientToken: string
  /** Provider transaction to open (e.g. txn_…). */
  transactionId: string
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
  /**
   * Creates the checkout transaction at the provider with the organization attached (custom
   * data the provider copies to the subscription). Not idempotent: an abandoned transaction
   * just stays unpaid.
   */
  checkout(input: { priceId: string; organizationId: string }): Promise<CheckoutSession>
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
