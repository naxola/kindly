import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { InvalidEmailWebhookError, parseResendWebhook } from '../src/email/suppression.ts'

const SECRET = `whsec_${Buffer.from('a-test-signing-key-of-32-bytes!!').toString('base64')}`
const NOW = new Date('2026-11-14T12:00:00Z')

/** Signs as Svix does: HMAC-SHA256 over `id.timestamp.body` with the base64 part of the secret. */
function signed(body: string, { id = 'msg_1', at = NOW, secret = SECRET } = {}) {
  const timestamp = String(Math.floor(at.getTime() / 1000))
  const key = Buffer.from(secret.replace('whsec_', ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new Headers({
    'svix-id': id,
    'svix-timestamp': timestamp,
    'svix-signature': `v1,${signature}`,
  })
}

// Shape taken from the Resend documentation (2026-11-14).
const bounced = (type: string) =>
  JSON.stringify({
    type: 'email.bounced',
    created_at: '2026-11-14T11:59:59.000Z',
    data: {
      email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
      to: ['Bounced@Example.com'],
      bounce: { message: 'mailbox unavailable', subType: 'Suppressed', type },
    },
  })

describe('parseResendWebhook', () => {
  it('reads a permanent bounce', () => {
    const body = bounced('Permanent')
    expect(parseResendWebhook(body, signed(body), SECRET, NOW)).toEqual({
      kind: 'suppress',
      id: 'msg_1',
      reason: 'BOUNCE_PERMANENT',
      recipients: ['Bounced@Example.com'],
    })
  })

  it('ignores a temporary bounce: it may still be delivered', () => {
    const body = bounced('Temporary')
    expect(parseResendWebhook(body, signed(body), SECRET, NOW).kind).toBe('ignored')
  })

  it('reads a complaint with every recipient', () => {
    const body = JSON.stringify({ type: 'email.complained', data: { to: ['a@x.com', 'b@x.com'] } })
    expect(parseResendWebhook(body, signed(body), SECRET, NOW)).toMatchObject({
      reason: 'COMPLAINT',
      recipients: ['a@x.com', 'b@x.com'],
    })
  })

  it('ignores other events and events without recipients', () => {
    for (const body of [
      JSON.stringify({ type: 'email.delivered', data: { to: ['a@x.com'] } }),
      JSON.stringify({ type: 'email.complained', data: {} }),
    ]) {
      expect(parseResendWebhook(body, signed(body), SECRET, NOW).kind).toBe('ignored')
    }
  })

  it('accepts when any of several signatures matches', () => {
    const body = bounced('Permanent')
    const headers = signed(body)
    headers.set('svix-signature', `v1,AAAA v2,BBBB ${headers.get('svix-signature')}`)
    expect(parseResendWebhook(body, headers, SECRET, NOW).kind).toBe('suppress')
  })

  it('rejects a wrong secret, a changed body, missing headers and an old timestamp', () => {
    const body = bounced('Permanent')
    const other = `whsec_${Buffer.from('another-key-another-key-another!').toString('base64')}`
    const cases: [string, Headers][] = [
      [body, signed(body, { secret: other })],
      [body.replace('Bounced', 'Someone'), signed(body)],
      [body, new Headers()],
      [body, signed(body, { at: new Date(NOW.getTime() - 6 * 60_000) })],
      [body, signed(body, { at: new Date(NOW.getTime() + 6 * 60_000) })],
    ]
    for (const [raw, headers] of cases) {
      expect(() => parseResendWebhook(raw, headers, SECRET, NOW)).toThrow(InvalidEmailWebhookError)
    }
  })

  it('rejects a signed body that is not JSON', () => {
    expect(() => parseResendWebhook('not json', signed('not json'), SECRET, NOW)).toThrow(
      InvalidEmailWebhookError,
    )
  })
})
