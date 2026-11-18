import type { BusinessEvent } from '@saas/core'
import { describe, expect, it, vi } from 'vitest'
import { signEvent, verifyEventSignature, WebhookEventSink } from '../src/events/index.ts'

const secret = 's'.repeat(32)
const event: BusinessEvent = {
  id: '0190f6b6-2f1c-7a3e-9d4b-1c2d3e4f5a6b',
  type: 'organization.created',
  occurredAt: '2026-11-06T10:00:00.000Z',
  organizationId: '0190f6b6-2f1c-7a3e-9d4b-1c2d3e4f5a6c',
  data: { name: 'Acme' },
}

describe('event webhook', () => {
  it('posts the event with headers and a signature the receiver can verify', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await new WebhookEventSink({ url: 'https://n8n.test/hook', secret, fetch }).deliver(event)
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(url).toBe('https://n8n.test/hook')
    expect(headers['x-event-id']).toBe(event.id)
    expect(headers['x-event-type']).toBe('organization.created')
    expect(
      verifyEventSignature(secret, {
        timestamp: Number(headers['x-timestamp']),
        body: init.body as string,
        signature: headers['x-signature']!,
      }),
    ).toBe(true)
  })

  it('a non-2xx answer throws, so the job is retried', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('down', { status: 503 }))
    await expect(
      new WebhookEventSink({ url: 'https://n8n.test/hook', secret, fetch }).deliver(event),
    ).rejects.toThrow('503')
  })

  it('verification rejects a tampered body, a wrong secret and an old timestamp', () => {
    const now = Date.now()
    const timestamp = Math.floor(now / 1000)
    const body = JSON.stringify(event)
    const signature = signEvent(secret, timestamp, body)
    expect(verifyEventSignature(secret, { timestamp, body: `${body} `, signature })).toBe(false)
    expect(verifyEventSignature('x'.repeat(32), { timestamp, body, signature })).toBe(false)
    expect(
      verifyEventSignature(secret, { timestamp, body, signature }, { now: now + 10 * 60 * 1000 }),
    ).toBe(false)
  })
})
