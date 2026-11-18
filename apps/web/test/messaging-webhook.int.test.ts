import { createMessagingRegistry, FakeMessagingAdapter } from '@saas/core'
import { newId, withTenant } from '@saas/database'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { api } from '../src/server/api/app.ts'
import { setMessagingForTests } from '../src/server/messaging.ts'
import { closeFixtures, openFixtures, ORIGIN, person, type Fixtures } from './api-helpers.ts'

let fx: Fixtures
beforeAll(async () => {
  fx = await openFixtures()
})
afterAll(() => closeFixtures(fx))
afterEach(() => setMessagingForTests(undefined))

const fake = new FakeMessagingAdapter('s3cret')

/** An organization through the API, with one account on the fake channel for its creator. */
async function organizationWithAccount() {
  const admin = await person(fx, 'admin')
  const created = await admin.browser.call('POST', '/api/v1/organizations', {
    name: 'Acme',
    slug: `acme-${newId().slice(-12)}`,
  })
  const organizationId = created.body.id as string
  const me = (await admin.browser.call('GET', '/api/v1/organization')).body.member.id as string
  const account = await withTenant(fx.db, organizationId, (tx) =>
    tx.messagingAccount.create({
      data: {
        organizationId,
        delegateId: me,
        channel: 'fake',
        externalAccountId: `acc-${newId()}`,
        status: 'CONNECTED',
      },
    }),
  )
  return { organizationId, accountId: account.id }
}

const post = (path: string, body: string, headers: Record<string, string> = {}) =>
  api.request(`${ORIGIN}${path}`, { method: 'POST', headers, body })

describe('messaging webhook route', () => {
  it('answers 404 while no adapter is registered (production today)', async () => {
    const { accountId } = await organizationWithAccount()
    const res = await post(
      `/api/webhooks/messaging/fake/${accountId}`,
      '{}',
      fake.signatureHeaders(),
    )
    expect(res.status).toBe(404)
  })

  it('stores a signed event, enqueues its processing and rejects a forged one', async () => {
    setMessagingForTests(createMessagingRegistry([fake]))
    const { organizationId, accountId } = await organizationWithAccount()
    const url = `/api/webhooks/messaging/fake/${accountId}`
    const body = JSON.stringify({
      kind: 'MESSAGE',
      externalConversationId: 'c1',
      externalMessageId: 'm1',
      externalContactId: 'x',
      text: 'Hola',
    })

    // No session, no CSRF: the signature is the authentication.
    const bad = await post(url, body, { 'x-fake-signature': 'nope' })
    expect(bad.status).toBe(401)
    expect(await withTenant(fx.db, organizationId, (tx) => tx.webhookEvent.count())).toBe(0)

    const ok = await post(url, body, fake.signatureHeaders())
    expect(ok.status).toBe(200)
    const events = await withTenant(fx.db, organizationId, (tx) => tx.webhookEvent.findMany())
    expect(events).toHaveLength(1)
    expect(events[0]?.rawBody).toBe(body)
    expect((events[0]?.headers as Record<string, string>)['x-fake-signature']).toBe('s3cret')
    const { rows } = await fx.jobs.query(
      `SELECT data->'payload'->>'webhookEventId' AS id FROM pgboss.job
       WHERE name = 'messaging.process-webhook' AND data->'payload'->>'webhookEventId' = $1`,
      [events[0]!.id],
    )
    expect(rows).toHaveLength(1)

    // Unknown account: the same 404 as an unknown channel.
    expect(
      (await post(`/api/webhooks/messaging/fake/${newId()}`, body, fake.signatureHeaders())).status,
    ).toBe(404)
    expect(
      (await post(`/api/webhooks/messaging/nope/${accountId}`, body, fake.signatureHeaders()))
        .status,
    ).toBe(404)
  })

  it('answers the provider handshake only when the adapter has one', async () => {
    const challenging = new FakeMessagingAdapter('s')
    challenging.verifyWebhookChallenge = (q) =>
      q.get('token') === 'ok' ? q.get('challenge') : null
    setMessagingForTests(createMessagingRegistry([challenging]))
    const { accountId } = await organizationWithAccount()
    const url = `${ORIGIN}/api/webhooks/messaging/fake/${accountId}`
    const good = await api.request(`${url}?token=ok&challenge=abc123`)
    expect([good.status, await good.text()]).toEqual([200, 'abc123'])
    expect((await api.request(`${url}?token=wrong&challenge=x`)).status).toBe(403)
    setMessagingForTests(createMessagingRegistry([fake]))
    expect((await api.request(`${url}?challenge=x`)).status).toBe(404)
  })
})
