import type { BusinessEvent, EventSink } from '@saas/core'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Logger } from '../logger/index.ts'

/**
 * Signed webhook delivery of business events (n8n…). Headers:
 *   X-Event-Id, X-Event-Type
 *   X-Timestamp: unix seconds of this attempt
 *   X-Signature: sha256=HMAC_SHA256(secret, `${timestamp}.${body}`) in hex
 * Receivers must verify the signature, reject old timestamps (replay) and deduplicate
 * by X-Event-Id (delivery is at-least-once).
 */
export const signEvent = (secret: string, timestamp: number, body: string) =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`

/** Reference verification for receivers (and tests). */
export function verifyEventSignature(
  secret: string,
  { timestamp, body, signature }: { timestamp: number; body: string; signature: string },
  { toleranceSeconds = 300, now = Date.now() }: { toleranceSeconds?: number; now?: number } = {},
): boolean {
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false
  const expected = Buffer.from(signEvent(secret, timestamp, body))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export interface WebhookSinkOptions {
  url: string
  secret: string
  /** Injectable for tests. */
  fetch?: typeof fetch
  timeoutMs?: number
}

export class WebhookEventSink implements EventSink {
  constructor(private readonly options: WebhookSinkOptions) {}

  async deliver(event: BusinessEvent) {
    const body = JSON.stringify(event)
    const timestamp = Math.floor(Date.now() / 1000)
    const response = await (this.options.fetch ?? fetch)(this.options.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-event-id': event.id,
        'x-event-type': event.type,
        'x-timestamp': String(timestamp),
        'x-signature': signEvent(this.options.secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
    })
    // Any non-2xx is a failure: the job retries with backoff.
    if (!response.ok) throw new Error(`Event webhook answered ${response.status}`)
  }
}

/** Without a configured receiver: events are only logged (type and id, never the data). */
export class LogEventSink implements EventSink {
  constructor(private readonly log: Logger) {}

  deliver(event: BusinessEvent) {
    this.log.info({ eventId: event.id, eventType: event.type }, 'event (no webhook configured)')
    return Promise.resolve()
  }
}
