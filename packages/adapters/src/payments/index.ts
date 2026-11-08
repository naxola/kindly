import type { PaymentEnv } from '@saas/config/env'
import {
  InvalidWebhookError,
  type CheckoutSession,
  type OverageCharge,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderSubscriptionStatus,
} from '@saas/core'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Paddle Billing (ADR 0012), from developer.paddle.com (read 2026-11-08):
 * - API: Bearer key, sandbox-api.paddle.com / api.paddle.com, `Paddle-Version: 1`.
 * - Webhooks: header `Paddle-Signature: ts=…;h1=…`, HMAC-SHA256 of `ts:rawBody` with the
 *   destination secret; several h1 during secret rotation; 5 s tolerance by default.
 * - One-off charge: POST /subscriptions/{id}/charge with a non-catalog price (amount in
 *   the lowest denomination). No idempotency key is documented: never retried here.
 * - Portal: POST /customers/{id}/portal-sessions → data.urls.general.overview.
 * Not operational until tested against the Paddle sandbox (CLAUDE.md).
 */
export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 5

type Fetch = typeof fetch

export interface PaddleConfig {
  environment: 'sandbox' | 'production'
  apiKey: string
  clientToken: string
  webhookSecret: string
  overageProductId: string
}

const STATUS: Record<string, ProviderSubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  // Paused subscriptions give no access: like canceled, the default plan applies.
  paused: 'CANCELED',
}

/** "12.34" → "1234" without floating point. EUR and USD have two decimals. */
export function toMinorUnits(amount: string): string {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount)
  if (!match) throw new Error(`Invalid amount '${amount}'`)
  const minor = `${match[1]}${(match[2] ?? '').padEnd(2, '0')}`.replace(/^0+(?=\d)/, '')
  return minor
}

/** Verifies a Paddle-Signature header; returns the timestamp. Exported for tests. */
export function verifyPaddleSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  now: Date,
  toleranceSeconds = PADDLE_SIGNATURE_TOLERANCE_SECONDS,
): number {
  if (!header) throw new InvalidWebhookError('missing signature')
  const parts = header.split(';').map((p) => p.trim().split('='))
  const ts = Number(parts.find(([k]) => k === 'ts')?.[1])
  const signatures = parts.filter(([k]) => k === 'h1').map(([, v]) => v ?? '')
  if (!Number.isInteger(ts) || signatures.length === 0) {
    throw new InvalidWebhookError('malformed signature')
  }
  if (Math.abs(now.getTime() / 1000 - ts) > toleranceSeconds) {
    throw new InvalidWebhookError('stale signature')
  }
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest()
  const valid = signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!valid) throw new InvalidWebhookError('signature mismatch')
  return ts
}

interface PaddleSubscriptionData {
  id: string
  status: string
  customer_id: string
  items: { price: { id: string } }[]
  current_billing_period: { starts_at: string; ends_at: string } | null
  scheduled_change: { action: string } | null
  custom_data: Record<string, unknown> | null
}

export class PaddlePaymentProvider implements PaymentProvider {
  readonly name = 'paddle'
  private readonly baseUrl: string

  constructor(
    private readonly config: PaddleConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.baseUrl =
      config.environment === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'
  }

  checkout(input: {
    priceId: string
    organizationId: string
    customerEmail: string | null
  }): CheckoutSession {
    // Paddle.js copies customData to the subscription it creates: that is how events find us.
    return {
      provider: this.name,
      environment: this.config.environment,
      clientToken: this.config.clientToken,
      priceId: input.priceId,
      customData: { organizationId: input.organizationId },
      customerEmail: input.customerEmail,
    }
  }

  async portalUrl({
    customerRef,
    subscriptionRef,
  }: {
    customerRef: string
    subscriptionRef: string | null
  }) {
    const body = await this.request('POST', `/customers/${customerRef}/portal-sessions`, {
      ...(subscriptionRef ? { subscription_ids: [subscriptionRef] } : {}),
    })
    const url = (body as { data?: { urls?: { general?: { overview?: string } } } }).data?.urls
      ?.general?.overview
    if (!url) throw new Error('Paddle portal session without URL')
    return url
  }

  async chargeOverage(charge: OverageCharge) {
    await this.request('POST', `/subscriptions/${charge.subscriptionRef}/charge`, {
      effective_from: 'immediately',
      items: [
        {
          quantity: 1,
          price: {
            product_id: this.config.overageProductId,
            description: charge.description,
            name: charge.description,
            tax_mode: 'account_setting',
            unit_price: { amount: toMinorUnits(charge.amount), currency_code: charge.currency },
            custom_data: { periodId: charge.periodId },
          },
        },
      ],
    })
  }

  parseWebhook(rawBody: string, headers: Headers, now: Date): ProviderEvent {
    verifyPaddleSignature(headers.get('paddle-signature'), rawBody, this.config.webhookSecret, now)
    const event = JSON.parse(rawBody) as {
      event_id: string
      event_type: string
      occurred_at: string
      data: unknown
    }
    const base = { id: event.event_id, occurredAt: new Date(event.occurred_at) }
    if (!event.event_type.startsWith('subscription.')) {
      return { ...base, kind: 'ignored', type: event.event_type }
    }
    const d = event.data as PaddleSubscriptionData
    const status = STATUS[d.status]
    const priceId = d.items[0]?.price.id
    if (!status || !priceId) return { ...base, kind: 'ignored', type: event.event_type }
    const organizationId = d.custom_data?.organizationId
    return {
      ...base,
      kind: 'subscription',
      subscription: {
        ref: d.id,
        customerRef: d.customer_id,
        status,
        priceId,
        periodStart: d.current_billing_period ? new Date(d.current_billing_period.starts_at) : null,
        periodEnd: d.current_billing_period ? new Date(d.current_billing_period.ends_at) : null,
        cancelAtPeriodEnd: d.scheduled_change?.action === 'cancel',
        organizationId: typeof organizationId === 'string' ? organizationId : null,
      },
    }
  }

  private async request(method: string, path: string, body: unknown) {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
        'paddle-version': '1',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    if (!res.ok) {
      // Only Paddle's error code: never the key or the request body.
      let code = 'unknown'
      try {
        code = (JSON.parse(text) as { error?: { code?: string } }).error?.code ?? code
      } catch {
        /* not JSON */
      }
      throw new Error(`Paddle ${method} ${path.split('/')[1]} failed: ${res.status} ${code}`)
    }
    return text ? (JSON.parse(text) as unknown) : null
  }
}

export function createPaymentProvider(env: PaymentEnv, fetchImpl?: Fetch): PaymentProvider | null {
  if (env.PAYMENT_PROVIDER === 'none') return null
  return new PaddlePaymentProvider(
    {
      environment: env.PADDLE_ENVIRONMENT,
      apiKey: env.PADDLE_API_KEY,
      clientToken: env.PADDLE_CLIENT_TOKEN,
      webhookSecret: env.PADDLE_WEBHOOK_SECRET,
      overageProductId: env.PADDLE_OVERAGE_PRODUCT_ID,
    },
    fetchImpl,
  )
}
