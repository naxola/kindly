import { receiveWebhook, verifyWebhookSubscription } from '@saas/core'
import { Hono } from 'hono'
import { db } from '../../db.ts'
import { messaging } from '../../messaging.ts'
import { queue } from '../../queue.ts'
import type { ApiEnv } from '../types.ts'

/**
 * Inbound messaging webhooks, one URL per account: `/api/webhooks/messaging/{channel}/{accountId}`.
 * Outside /v1: no session or CSRF; the provider's signature is the authentication. The event is
 * only verified and stored here; the worker normalizes it (retries, ordering, alerts), so the
 * answer is fast and the provider does not retry. An unknown channel or account is a 404 that does
 * not reveal which of the two it was.
 */
export const messagingWebhookRoutes = new Hono<ApiEnv>()
  .get('/webhooks/messaging/:channel/:accountId', async (c) => {
    const { channel, accountId } = c.req.param()
    const outcome = await verifyWebhookSubscription(
      { db: db(), registry: messaging() },
      channel,
      accountId,
      new URL(c.req.url).searchParams,
    )
    if (outcome.status === 200) return c.text(outcome.body, 200)
    return c.body(null, outcome.status)
  })
  .post('/webhooks/messaging/:channel/:accountId', async (c) => {
    const { channel, accountId } = c.req.param()
    // The raw body, byte for byte: the signature is computed over it.
    const rawBody = await c.req.text()
    const headers: Record<string, string> = {}
    c.req.raw.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })
    const outcome = await receiveWebhook(
      {
        db: db(),
        queue: await queue(),
        registry: messaging(),
        correlationId: c.get('correlationId'),
      },
      channel,
      accountId,
      rawBody,
      headers,
    )
    if (outcome.status === 200) return c.body(null, 200)
    c.get('log').warn({ channel, status: outcome.status }, 'messaging webhook rejected')
    return c.body(null, outcome.status)
  })
