import { createMessagingRegistry, FakeMessagingAdapter, processWebhookEvent } from '@saas/core'
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

/** An admin with an account on the fake channel and one inbound file in a conversation. */
async function conversationWithFile(mediaId: string) {
  setMessagingForTests(createMessagingRegistry([fake]))
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
  const res = await api.request(`${ORIGIN}/api/webhooks/messaging/fake/${account.id}`, {
    method: 'POST',
    headers: fake.signatureHeaders(),
    body: JSON.stringify({
      kind: 'MESSAGE',
      externalConversationId: 'chat-1',
      externalMessageId: `m-${newId()}`,
      externalContactId: 'marta',
      contactDisplayName: 'Marta',
      attachment: {
        kind: 'DOCUMENT',
        mediaId,
        mimeType: 'application/pdf',
        filename: 'parte de baja.pdf',
      },
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
  const message = await withTenant(fx.db, organizationId, (tx) =>
    tx.message.findFirstOrThrow({ where: { messagingAccountId: account.id } }),
  )
  // The test cookie jar is private to the helper; the download needs the raw response.
  const jar = (admin.browser as unknown as { jar: Map<string, string> }).jar
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const download = () =>
    api.request(
      `${ORIGIN}/api/v1/conversations/${message.conversationId}/messages/${message.id}/media`,
      { headers: { origin: ORIGIN, cookie } },
    )
  return { admin, message, download }
}

describe('file download through the API', () => {
  it('the thread describes the file; the download streams it with safe, uncached headers', async () => {
    const { admin, message, download } = await conversationWithFile('media-http')
    const thread = await admin.browser.call(
      'GET',
      `/api/v1/conversations/${message.conversationId}/messages`,
    )
    expect(thread.body.items[0].attachment).toEqual({
      kind: 'DOCUMENT',
      filename: 'parte de baja.pdf',
      mimeType: 'application/pdf',
      downloadable: true,
      captioned: false,
    })
    const res = await download()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Contenido simulado del archivo media-http')
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="parte de baja.pdf"; filename*=UTF-8''parte%20de%20baja.pdf`,
    )
  })

  it('an expired file answers 404 with its reason, and downloads are limited per person', async () => {
    const expired = await conversationWithFile('expired-x')
    const gone = await expired.download()
    expect(gone.status).toBe(404)
    expect(
      ((await gone.json()) as { error: { details: { code: string }[] } }).error.details[0]!.code,
    ).toBe('MEDIA_EXPIRED')

    const { download } = await conversationWithFile('media-many')
    let last = 0
    for (let i = 0; i < 21; i++) last = (await download()).status
    expect(last).toBe(429)
  })
})
