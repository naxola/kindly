import { createMessagingRegistry, FakeMessagingAdapter, processWebhookEvent } from '@saas/core'
import { newId, withTenant } from '@saas/database'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { api } from '../src/server/api/app.ts'
import { setMessagingForTests } from '../src/server/messaging.ts'
import {
  closeFixtures,
  invitationToken,
  openFixtures,
  ORIGIN,
  person,
  type Fixtures,
} from './api-helpers.ts'

let fx: Fixtures
beforeAll(async () => {
  fx = await openFixtures()
})
afterAll(() => closeFixtures(fx))
afterEach(() => setMessagingForTests(undefined))

const fake = new FakeMessagingAdapter('s3cret')

async function team() {
  setMessagingForTests(createMessagingRegistry([fake]))
  const admin = await person(fx, 'admin')
  const created = await admin.browser.call('POST', '/api/v1/organizations', {
    name: 'Acme',
    slug: `acme-${newId().slice(-12)}`,
  })
  const organizationId = created.body.id as string
  const delegate = await person(fx, 'delegate')
  await admin.browser.call('POST', '/api/v1/invitations', {
    email: delegate.email,
    firstName: 'Luis',
  })
  await delegate.browser.call('POST', '/api/v1/invitations/accept', {
    token: await invitationToken(fx, delegate.email),
  })
  const members = (await admin.browser.call('GET', '/api/v1/members')).body.items as {
    id: string
    email: string
  }[]
  const idOf = (email: string) => members.find((m) => m.email === email)!.id
  const accountFor = (memberId: string) =>
    withTenant(fx.db, organizationId, (tx) =>
      tx.messagingAccount.create({
        data: {
          organizationId,
          delegateId: memberId,
          channel: 'fake',
          externalAccountId: `acc-${newId()}`,
          status: 'CONNECTED',
        },
      }),
    )
  /** A message from `name` through the public webhook, processed as the worker would. */
  async function inbound(accountId: string, name: string, text = 'Hola') {
    const res = await api.request(`${ORIGIN}/api/webhooks/messaging/fake/${accountId}`, {
      method: 'POST',
      headers: fake.signatureHeaders(),
      body: JSON.stringify({
        kind: 'MESSAGE',
        externalConversationId: `chat-${name}`,
        externalMessageId: `m-${newId()}`,
        externalContactId: name,
        contactDisplayName: name,
        text,
      }),
    })
    expect(res.status).toBe(200)
    const event = await withTenant(fx.db, organizationId, (tx) =>
      tx.webhookEvent.findFirstOrThrow({ where: { processedAt: null }, orderBy: { id: 'desc' } }),
    )
    await processWebhookEvent(
      { db: fx.db, registry: createMessagingRegistry([fake]) },
      organizationId,
      event.id,
    )
  }
  return {
    admin,
    delegate,
    adminId: idOf(admin.email),
    luisId: idOf(delegate.email),
    accountFor,
    inbound,
  }
}

describe('inbox and thread through the API', () => {
  it('lists with views and counters, opens the thread, marks read and replies only from the own account', async () => {
    const t = await team()
    const luisAccount = await t.accountFor(t.luisId)
    const adminAccount = await t.accountFor(t.adminId)
    await t.inbound(luisAccount.id, 'Marta', 'Necesito ayuda')
    await t.inbound(adminAccount.id, 'Del admin')

    // The delegate only sees what is theirs; the admin sees everything.
    let res = await t.delegate.browser.call('GET', '/api/v1/conversations')
    expect(res.body.items.map((c: { contactName: string }) => c.contactName)).toEqual(['Marta'])
    res = await t.admin.browser.call('GET', '/api/v1/conversations')
    expect(res.body.items).toHaveLength(2)
    expect((await t.admin.browser.call('GET', '/api/v1/conversations/counts')).body).toEqual({
      pending: 2,
      unread: 2,
      unassigned: 2,
      all: 2,
    })
    expect((await t.delegate.browser.call('GET', '/api/v1/conversations/counts')).body.all).toBe(1)
    expect(
      (await t.delegate.browser.call('GET', '/api/v1/conversations/channels')).body.items,
    ).toEqual(['fake'])
    res = await t.admin.browser.call('GET', '/api/v1/conversations?search=ayuda&view=pending')
    expect(res.body.items.map((c: { contactName: string }) => c.contactName)).toEqual(['Marta'])
    expect((await t.admin.browser.call('GET', '/api/v1/conversations?view=bogus')).status).toBe(400)

    const marta = (await t.delegate.browser.call('GET', '/api/v1/conversations')).body.items[0]
    const theirs = (await t.admin.browser.call('GET', '/api/v1/conversations?search=admin')).body
      .items[0]

    // Detail and thread.
    res = await t.delegate.browser.call('GET', `/api/v1/conversations/${marta.id}`)
    expect(res.body).toMatchObject({
      contact: { name: 'Marta', isUnassigned: true },
      account: { delegateName: 'Luis', status: 'CONNECTED' },
      serviceWindow: { status: 'NOT_APPLICABLE' },
      canReply: true,
    })
    res = await t.delegate.browser.call('GET', `/api/v1/conversations/${marta.id}/messages`)
    expect(res.body.items.map((m: { body: string }) => m.body)).toEqual(['Necesito ayuda'])

    // What is not visible looks like it does not exist.
    for (const path of ['', '/messages']) {
      expect(
        (await t.delegate.browser.call('GET', `/api/v1/conversations/${theirs.id}${path}`)).status,
      ).toBe(404)
    }
    expect(
      (await t.delegate.browser.call('POST', `/api/v1/conversations/${theirs.id}/read`)).status,
    ).toBe(404)

    // Read: the unread counter drops for this person's mailbox.
    expect(
      (await t.delegate.browser.call('POST', `/api/v1/conversations/${marta.id}/read`)).status,
    ).toBe(204)
    expect((await t.delegate.browser.call('GET', '/api/v1/conversations/counts')).body.unread).toBe(
      0,
    )

    // Reply: the owner can; an administrator cannot answer from Luis's number.
    res = await t.delegate.browser.call('POST', `/api/v1/conversations/${marta.id}/messages`, {
      text: 'Claro, dime',
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      direction: 'OUTBOUND',
      body: 'Claro, dime',
      sentFromDevice: false,
      deliveryStatus: 'SENT',
    })
    res = await t.admin.browser.call('POST', `/api/v1/conversations/${marta.id}/messages`, {
      text: 'Yo respondo',
    })
    expect(res.status).toBe(403)
    expect(res.body.error.details).toEqual([{ code: 'NOT_ACCOUNT_OWNER' }])
    // ... and for the admin the conversation is read-only.
    res = await t.admin.browser.call('GET', `/api/v1/conversations/${marta.id}`)
    expect(res.body.canReply).toBe(false)
    expect(
      (
        await t.delegate.browser.call('POST', `/api/v1/conversations/${marta.id}/messages`, {
          text: '',
        })
      ).status,
    ).toBe(400)

    // Answered: Marta is no longer pending, and the thread keeps both messages.
    expect(
      (await t.delegate.browser.call('GET', '/api/v1/conversations?view=pending')).body.items,
    ).toEqual([])
    res = await t.delegate.browser.call('GET', `/api/v1/conversations/${marta.id}/messages`)
    expect(res.body.items.map((m: { direction: string }) => m.direction)).toEqual([
      'INBOUND',
      'OUTBOUND',
    ])
  })
})
