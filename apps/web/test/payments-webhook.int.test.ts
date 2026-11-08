import { createDb, newId, withTenant, type Db } from '@saas/database'
import { createHmac } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api } from '../src/server/api/app.ts'

const SECRET = 'pdl_ntfset_webhook_test'
let db: Db
let jobs: pg.Client

beforeAll(async () => {
  Object.assign(process.env, {
    APP_URL: 'http://localhost:3000',
    PAYMENT_PROVIDER: 'paddle',
    PADDLE_ENVIRONMENT: 'sandbox',
    PADDLE_API_KEY: 'pdl_sdbx_apikey_test',
    PADDLE_CLIENT_TOKEN: 'test_client_token',
    PADDLE_WEBHOOK_SECRET: SECRET,
    PADDLE_OVERAGE_PRODUCT_ID: 'pro_overage',
  })
  ;(globalThis as { __payments?: unknown }).__payments = undefined
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  jobs = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await jobs.connect()
})
afterAll(async () => {
  delete process.env.PAYMENT_PROVIDER
  ;(globalThis as { __payments?: unknown }).__payments = undefined
  await db.$disconnect()
  await jobs.end()
})

const body = (orgId: string, eventId: string) =>
  JSON.stringify({
    event_id: eventId,
    event_type: 'subscription.created',
    occurred_at: new Date().toISOString(),
    notification_id: 'ntf_1',
    data: {
      id: `sub_${eventId}`,
      status: 'active',
      customer_id: 'ctm_1',
      items: [{ price: { id: 'pri_x' } }],
      current_billing_period: {
        starts_at: '2026-11-08T00:00:00Z',
        ends_at: '2026-12-08T00:00:00Z',
      },
      scheduled_change: null,
      custom_data: { organizationId: orgId },
    },
  })

const post = (raw: string, signature?: string) =>
  api.request('http://localhost:3000/api/webhooks/payments', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'paddle-signature': signature } : {}),
    },
    body: raw,
  })

const sign = (raw: string) => {
  const ts = Math.floor(Date.now() / 1000)
  return `ts=${ts};h1=${createHmac('sha256', SECRET).update(`${ts}:${raw}`).digest('hex')}`
}

describe('payment webhook', () => {
  it('rejects unsigned or forged notifications', async () => {
    const raw = body(newId(), `evt_${newId()}`)
    expect((await post(raw)).status).toBe(401)
    expect((await post(raw, sign(raw.replace('active', 'canceled')))).status).toBe(401)
  })

  it('enqueues a verified event once for its organization', async () => {
    const orgId = newId()
    await withTenant(db, orgId, (tx) =>
      tx.organization.create({ data: { id: orgId, name: 'Paddle Co', slug: `paddle-${orgId}` } }),
    )
    const eventId = `evt_${newId()}`
    const raw = body(orgId, eventId)
    expect((await post(raw, sign(raw))).status).toBe(200)
    expect((await post(raw, sign(raw))).status).toBe(200)
    const { rows } = await jobs.query(
      `SELECT data->'meta'->>'organizationId' AS org, data->'payload'->'event'->>'id' AS event
       FROM pgboss.job WHERE name = 'billing.provider-event' AND data->'payload'->'event'->>'id' = $1`,
      [eventId],
    )
    expect(rows).toEqual([{ org: orgId, event: eventId }])
  })
})
