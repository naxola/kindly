import { createHmac } from 'node:crypto'
import type { Conversation, MessagingAccount } from '@saas/database'
import { describe, expect, it, vi } from 'vitest'
import { WhatsAppTestAdapter } from '../src/messaging/whatsapp-test.ts'

/**
 * Unit tests of the Meta test-number adapter: real HMAC verification, Meta's subscription
 * handshake, parsing of Meta's webhook JSON and the Graph API calls, with `fetch` injected (CI never
 * makes a real network call).
 */

const PHONE_NUMBER_ID = '1355229964336175'
const WABA_ID = '2211108926469298'
const APP_SECRET = 'test-app-secret'

function makeAdapter(fetchImpl?: typeof fetch) {
  return new WhatsAppTestAdapter({
    phoneNumberId: PHONE_NUMBER_ID,
    wabaId: WABA_ID,
    accessToken: 'test-token',
    appSecret: APP_SECRET,
    verifyToken: 'my-verify-token',
    ...(fetchImpl ? { fetchImpl } : {}),
  })
}

const sign = (body: string, secret = APP_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const change = (value: object, field = 'messages') => ({
  object: 'whatsapp_business_account',
  entry: [{ id: WABA_ID, changes: [{ field, value }] }],
})
const meta = { display_phone_number: '15551739132', phone_number_id: PHONE_NUMBER_ID }

// Shape captured from Meta's "messages" webhook (Cloud API), ids anonymised.
const inbound = change({
  messaging_product: 'whatsapp',
  metadata: meta,
  contacts: [{ profile: { name: 'Nacho' }, wa_id: '34600111222' }],
  messages: [
    {
      from: '34600111222',
      id: 'wamid.IN1',
      timestamp: '1790150400',
      text: { body: 'Hola, ¿me ayudas?' },
      type: 'text',
    },
  ],
})

const statuses = change({
  metadata: meta,
  statuses: [
    { id: 'wamid.OUT1', status: 'delivered', timestamp: '1790150460' },
    { id: 'wamid.OUT1', status: 'read', timestamp: '1790150470' },
    { id: 'wamid.OUT1', status: 'something-new', timestamp: '1790150480' },
  ],
})

describe('webhook signature', () => {
  it("accepts Meta's HMAC-SHA256 of the raw body with the App Secret", () => {
    const body = JSON.stringify(inbound)
    expect(makeAdapter().verifyWebhookSignature(body, { 'x-hub-signature-256': sign(body) })).toBe(
      true,
    )
  })

  it('rejects another secret, a tampered body, a malformed header or none', () => {
    const adapter = makeAdapter()
    const body = JSON.stringify(inbound)
    expect(
      adapter.verifyWebhookSignature(body, { 'x-hub-signature-256': sign(body, 'other') }),
    ).toBe(false)
    expect(adapter.verifyWebhookSignature(`${body} `, { 'x-hub-signature-256': sign(body) })).toBe(
      false,
    )
    expect(adapter.verifyWebhookSignature(body, { 'x-hub-signature-256': 'abc' })).toBe(false)
    expect(adapter.verifyWebhookSignature(body, {})).toBe(false)
  })
})

describe('subscription handshake', () => {
  it('echoes the challenge only for mode=subscribe with the right verify token', () => {
    const adapter = makeAdapter()
    const q = (s: string) => new URLSearchParams(s)
    expect(
      adapter.verifyWebhookChallenge(
        q('hub.mode=subscribe&hub.verify_token=my-verify-token&hub.challenge=42'),
      ),
    ).toBe('42')
    expect(
      adapter.verifyWebhookChallenge(
        q('hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=42'),
      ),
    ).toBeNull()
    expect(
      adapter.verifyWebhookChallenge(
        q('hub.mode=unsubscribe&hub.verify_token=my-verify-token&hub.challenge=42'),
      ),
    ).toBeNull()
    expect(
      adapter.verifyWebhookChallenge(q('hub.mode=subscribe&hub.verify_token=my-verify-token')),
    ).toBeNull()
  })
})

describe("parsing Meta's webhook JSON", () => {
  const adapter = makeAdapter()

  it("turns an inbound text into a MESSAGE keyed by the sender's wa_id", () => {
    expect(adapter.parseWebhookEvents(JSON.stringify(inbound))).toEqual([
      {
        kind: 'MESSAGE',
        externalConversationId: '34600111222',
        externalMessageId: 'wamid.IN1',
        externalContactId: '34600111222',
        contactDisplayName: 'Nacho',
        contactPhone: '+34600111222',
        text: 'Hola, ¿me ayudas?',
        attachment: null,
        occurredAt: new Date(1790150400 * 1000),
      },
    ])
  })

  it('turns known statuses into DELIVERY_UPDATEs and drops unknown ones', () => {
    const events = adapter.parseWebhookEvents(JSON.stringify(statuses))
    expect(events.map((e) => [e.kind, 'deliveryStatus' in e ? e.deliveryStatus : null])).toEqual([
      ['DELIVERY_UPDATE', 'DELIVERED'],
      ['DELIVERY_UPDATE', 'READ'],
    ])
  })

  it('keeps non-text messages visible with a placeholder instead of dropping them', () => {
    const image = change({
      metadata: meta,
      messages: [{ from: '34600111222', id: 'wamid.IMG', timestamp: '1790150400', type: 'image' }],
    })
    const [event] = adapter.parseWebhookEvents(JSON.stringify(image))
    expect(event).toMatchObject({ kind: 'MESSAGE', externalMessageId: 'wamid.IMG' })
    expect(event && 'text' in event && event.text).toContain('image')
  })

  it('ignores events for another number, other fields and other objects', () => {
    const other = change({
      metadata: { phone_number_id: 'someone-else' },
      messages: [{ from: '1', id: 'x', timestamp: '1', type: 'text' }],
    })
    const field = change(
      { metadata: meta, messages: [{ from: '1', id: 'x', timestamp: '1', type: 'text' }] },
      'account_update',
    )
    expect(adapter.parseWebhookEvents(JSON.stringify(other))).toEqual([])
    expect(adapter.parseWebhookEvents(JSON.stringify(field))).toEqual([])
    expect(adapter.parseWebhookEvents(JSON.stringify({ object: 'page', entry: [] }))).toEqual([])
  })
})

describe('Graph API', () => {
  const account = {} as MessagingAccount
  const conversation = { externalConversationId: '34600111222' } as Conversation

  it("sends free text to the conversation's wa_id and returns Meta's message id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: 'wamid.OUT1' }] }))
    const result = await makeAdapter(fetchImpl).sendMessage(account, conversation, {
      text: 'Claro',
    })
    expect(result).toEqual({ externalMessageId: 'wamid.OUT1', deliveryStatus: 'SENT' })
    const [url, init] = fetchImpl.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string>; body: string },
    ]
    expect(url).toBe(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`)
    expect(init.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(init.body)).toMatchObject({
      messaging_product: 'whatsapp',
      to: '34600111222',
      type: 'text',
      text: { body: 'Claro' },
    })
  })

  it("records a rejected send as FAILED with Meta's reason, never leaking the token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { message: 'Recipient phone number not in allowed list' } }, 400),
      )
    const result = await makeAdapter(fetchImpl).sendMessage(account, conversation, {
      text: 'Claro',
    })
    expect(result.deliveryStatus).toBe('FAILED')
    expect(result.externalMessageId).toMatch(/^failed-/)
    expect(result.failureReason).toContain('not in allowed list')
    expect(result.failureReason).not.toContain('test-token')
  })

  it('connects by validating the phone number with Meta and subscribing the WABA', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ display_phone_number: '+1 555-173-9132', verified_name: 'Test Number' }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    const result = await makeAdapter(fetchImpl).connectAccount()
    expect(result).toMatchObject({
      externalAccountId: PHONE_NUMBER_ID,
      externalBusinessAccountId: WABA_ID,
      phone: '+15551739132',
    })
    expect(result.credentialsReference).toBe('env://WHATSAPP_TEST_ACCESS_TOKEN')
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      `https://graph.facebook.com/v25.0/${WABA_ID}/subscribed_apps`,
    )
    expect((fetchImpl.mock.calls[1]?.[1] as RequestInit).method).toBe('POST')
  })

  it('fails the connection when Meta rejects the credentials', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'Invalid OAuth access token' } }, 401))
    await expect(makeAdapter(fetchImpl).connectAccount()).rejects.toThrow(
      'Invalid OAuth access token',
    )
  })

  it("sends Meta's read + typing_indicator payload anchored to the contact's message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    await makeAdapter(fetchImpl).sendTypingIndicator(account, conversation, 'wamid.IN1')
    const init = fetchImpl.mock.calls[0]?.[1] as { body: string }
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.IN1',
      typing_indicator: { type: 'text' },
    })
  })
})

describe('files (pass-through download, never stored)', () => {
  const doc = change({
    metadata: meta,
    contacts: [{ wa_id: '34600111222', profile: { name: 'Marta' } }],
    messages: [
      {
        from: '34600111222',
        id: 'wamid.DOC',
        timestamp: '1790150400',
        type: 'document',
        document: { id: 'media-1', mime_type: 'application/pdf', filename: 'baja.pdf' },
      },
      {
        from: '34600111222',
        id: 'wamid.IMG2',
        timestamp: '1790150401',
        type: 'image',
        image: { id: 'media-2', mime_type: 'image/jpeg', caption: 'Mi parte' },
      },
    ],
  })
  const account = {} as MessagingAccount
  const attachment = {
    kind: 'DOCUMENT' as const,
    mediaId: 'media-1',
    mimeType: 'application/pdf',
    filename: 'baja.pdf',
  }
  const publicHost = () => Promise.resolve(['157.240.0.1'])
  const withResolver = (fetchImpl: typeof fetch, resolveHost = publicHost) =>
    new WhatsAppTestAdapter({
      phoneNumberId: PHONE_NUMBER_ID,
      accessToken: 'test-token',
      appSecret: APP_SECRET,
      verifyToken: 'v',
      fetchImpl,
      resolveHost,
    })

  it('reads the file descriptor of media messages; the caption is the text', () => {
    const [d, i] = makeAdapter().parseWebhookEvents(JSON.stringify(doc))
    expect(d).toMatchObject({ text: '[Documento: baja.pdf]', attachment })
    expect(i).toMatchObject({
      text: 'Mi parte',
      attachment: { kind: 'IMAGE', mediaId: 'media-2', filename: null },
    })
  })

  it('downloads in two steps with the token, without following redirects', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'application/pdf' }),
      )
      .mockResolvedValueOnce(
        new Response('PDF', {
          status: 200,
          headers: { 'content-type': 'application/pdf', 'content-length': '3' },
        }),
      )
    const media = await withResolver(fetchImpl).downloadMedia(account, attachment)
    expect(await new Response(media.body).text()).toBe('PDF')
    expect(media).toMatchObject({ contentType: 'application/pdf', contentLength: 3 })
    const [, second] = fetchImpl.mock.calls as [unknown, [URL, RequestInit]][]
    expect(String(second![0])).toBe('https://lookaside.fbsbx.com/x')
    expect(second![1]).toMatchObject({
      redirect: 'manual',
      headers: { Authorization: 'Bearer test-token' },
    })
  })

  it('an expired id is unavailable; private, non-https or oversized addresses are refused', async () => {
    const gone = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: 'Object does not exist' } }, 400))
    await expect(withResolver(gone).downloadMedia(account, attachment)).rejects.toMatchObject({
      name: 'MediaUnavailableError',
    })
    const toPrivate = vi.fn().mockResolvedValue(jsonResponse({ url: 'https://internal.example/x' }))
    await expect(
      withResolver(toPrivate, () => Promise.resolve(['10.0.0.5'])).downloadMedia(
        account,
        attachment,
      ),
    ).rejects.toThrow(/public address/)
    const plain = vi.fn().mockResolvedValue(jsonResponse({ url: 'http://lookaside.fbsbx.com/x' }))
    await expect(withResolver(plain).downloadMedia(account, attachment)).rejects.toThrow(/usable/)
    const huge = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ url: 'https://lookaside.fbsbx.com/x' }))
      .mockResolvedValueOnce(
        new Response('x', { status: 200, headers: { 'content-length': String(26 * 1024 * 1024) } }),
      )
    await expect(withResolver(huge).downloadMedia(account, attachment)).rejects.toMatchObject({
      name: 'MediaTooLargeError',
    })
  })
})
