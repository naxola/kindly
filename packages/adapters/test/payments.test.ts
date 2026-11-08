import { InvalidWebhookError } from '@saas/core'
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createPaymentProvider,
  PaddlePaymentProvider,
  toMinorUnits,
  verifyPaddleSignature,
} from '../src/payments/index.ts'

const SECRET = 'pdl_ntfset_test_secret'
const NOW = new Date('2026-11-08T12:00:00Z')
const TS = Math.floor(NOW.getTime() / 1000)
const sign = (body: string, ts = TS, secret = SECRET) =>
  `ts=${ts};h1=${createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')}`

const config = {
  environment: 'sandbox' as const,
  apiKey: 'pdl_sdbx_apikey_secret',
  clientToken: 'test_client_token',
  webhookSecret: SECRET,
  overageProductId: 'pro_overage',
}

const subscriptionEvent = (patch: object = {}) =>
  JSON.stringify({
    event_id: 'evt_1',
    event_type: 'subscription.updated',
    occurred_at: '2026-11-08T11:59:58.000Z',
    notification_id: 'ntf_1',
    data: {
      id: 'sub_1',
      status: 'active',
      customer_id: 'ctm_1',
      items: [{ price: { id: 'pri_pro' } }],
      current_billing_period: {
        starts_at: '2026-11-05T00:00:00Z',
        ends_at: '2026-12-05T00:00:00Z',
      },
      scheduled_change: null,
      custom_data: { organizationId: '0190f6b6-2f1c-7a3e-9d4b-1c2d3e4f5a6b' },
      ...patch,
    },
  })

describe('Paddle webhook signature', () => {
  it('accepts a valid signature, also during secret rotation', () => {
    const body = subscriptionEvent()
    expect(verifyPaddleSignature(sign(body), body, SECRET, NOW)).toBe(TS)
    const rotated = `${sign(body, TS, 'old_secret')};h1=${sign(body).split('h1=')[1]}`
    expect(verifyPaddleSignature(rotated, body, SECRET, NOW)).toBe(TS)
  })

  it('rejects tampered bodies, wrong secrets, stale or missing signatures', () => {
    const body = subscriptionEvent()
    const reject = (header: string | null, b = body) =>
      expect(() => verifyPaddleSignature(header, b, SECRET, NOW)).toThrow(InvalidWebhookError)
    reject(sign(body), body.replace('active', 'canceled'))
    reject(sign(body, TS, 'other'))
    reject(sign(body, TS - 60))
    reject(null)
    reject('garbage')
  })
})

describe('Paddle events', () => {
  const paddle = new PaddlePaymentProvider(config)
  const parse = (body: string) =>
    paddle.parseWebhook(body, new Headers({ 'paddle-signature': sign(body) }), NOW)

  it('normalizes a subscription event', () => {
    expect(parse(subscriptionEvent())).toEqual({
      id: 'evt_1',
      occurredAt: new Date('2026-11-08T11:59:58.000Z'),
      kind: 'subscription',
      subscription: {
        ref: 'sub_1',
        customerRef: 'ctm_1',
        status: 'ACTIVE',
        priceId: 'pri_pro',
        periodStart: new Date('2026-11-05T00:00:00Z'),
        periodEnd: new Date('2026-12-05T00:00:00Z'),
        cancelAtPeriodEnd: false,
        organizationId: '0190f6b6-2f1c-7a3e-9d4b-1c2d3e4f5a6b',
      },
    })
  })

  it('maps statuses and scheduled cancellations', () => {
    const ev = parse(
      subscriptionEvent({
        status: 'paused',
        current_billing_period: null,
        scheduled_change: { action: 'cancel' },
      }),
    )
    expect(ev.kind === 'subscription' && ev.subscription).toMatchObject({
      status: 'CANCELED',
      periodStart: null,
      cancelAtPeriodEnd: true,
    })
  })

  it('acknowledges events that do not change billing state', () => {
    const body = JSON.stringify({
      event_id: 'evt_2',
      event_type: 'transaction.completed',
      occurred_at: '2026-11-08T11:59:59Z',
      data: {},
    })
    expect(parse(body)).toMatchObject({ kind: 'ignored', type: 'transaction.completed' })
  })
})

describe('Paddle API calls', () => {
  it('charges the overage as a non-catalog price in minor units', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"data":{}}', { status: 201 }))
    await new PaddlePaymentProvider(config, fetch).chargeOverage({
      subscriptionRef: 'sub_1',
      amount: '12.5',
      currency: 'EUR',
      description: 'Usage 2026-10-05 – 2026-11-05',
      periodId: 'period-1',
    })
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://sandbox-api.paddle.com/subscriptions/sub_1/charge')
    expect((init.headers as Record<string, string>).authorization).toBe(
      'Bearer pdl_sdbx_apikey_secret',
    )
    expect(JSON.parse(init.body as string)).toMatchObject({
      effective_from: 'immediately',
      items: [
        {
          quantity: 1,
          price: {
            product_id: 'pro_overage',
            unit_price: { amount: '1250', currency_code: 'EUR' },
            custom_data: { periodId: 'period-1' },
          },
        },
      ],
    })
  })

  it('reports API errors without the key', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":{"code":"subscription_is_past_due"}}', { status: 400 }),
      )
    const call = new PaddlePaymentProvider(config, fetch).chargeOverage({
      subscriptionRef: 'sub_1',
      amount: '1',
      currency: 'EUR',
      description: 'x',
      periodId: 'p',
    })
    await expect(call).rejects.toThrow('400 subscription_is_past_due')
    await expect(call).rejects.not.toThrow(/apikey/)
  })

  it('opens a portal session', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { urls: { general: { overview: 'https://portal/x' } } } }),
        {
          status: 201,
        },
      ),
    )
    const url = await new PaddlePaymentProvider(config, fetch).portalUrl({
      customerRef: 'ctm_1',
      subscriptionRef: 'sub_1',
    })
    expect(url).toBe('https://portal/x')
    const [called, init] = fetch.mock.calls[0] as [string, RequestInit]
    expect(called).toBe('https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions')
    expect(JSON.parse(init.body as string)).toEqual({ subscription_ids: ['sub_1'] })
  })

  it('amounts are converted without floating point', () => {
    expect(['0.1', '12', '12.34', '1000.05'].map(toMinorUnits)).toEqual([
      '10',
      '1200',
      '1234',
      '100005',
    ])
    expect(() => toMinorUnits('1.234')).toThrow()
  })

  it('no provider when payments are disabled', () => {
    expect(createPaymentProvider({ PAYMENT_PROVIDER: 'none' })).toBeNull()
  })
})
