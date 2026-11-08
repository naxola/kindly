import { InvalidWebhookError, providerEventJob, providerEventPayload } from '@saas/core'
import { withTenant } from '@saas/database'
import { Hono } from 'hono'
import { db } from '../../db.ts'
import { payments } from '../../payments.ts'
import { queue } from '../../queue.ts'
import type { ApiEnv } from '../types.ts'

/**
 * Payment provider notifications (ADR 0012). Outside /v1: no session or CSRF; the
 * signature is the authentication. The event is only verified and enqueued here; the
 * worker applies it (retries, ordering, alerts). Answers fast so the provider does not retry.
 */
export const paymentWebhookRoutes = new Hono<ApiEnv>().post('/webhooks/payments', async (c) => {
  const provider = payments()
  if (!provider) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
  const log = c.get('log')
  const raw = await c.req.text()
  let event
  try {
    event = provider.parseWebhook(raw, c.req.raw.headers, new Date())
  } catch (err) {
    if (err instanceof InvalidWebhookError) {
      log.warn({ reason: err.message }, 'payment webhook rejected')
      return c.json({ error: { code: 'INVALID_SIGNATURE' } }, 401)
    }
    throw err
  }
  if (event.kind === 'ignored') return c.body(null, 200)
  const organizationId = event.subscription.organizationId
  if (!organizationId) {
    // A subscription created outside our checkout: nothing to attach it to.
    log.warn({ eventId: event.id }, 'payment event without organization')
    return c.body(null, 200)
  }
  const q = await queue()
  await withTenant(db(), organizationId, (tx) =>
    q.enqueue(tx, providerEventJob, providerEventPayload(organizationId, provider.name, event), {
      organizationId,
      correlationId: c.get('correlationId'),
      idempotencyKey: `${provider.name}:${event.id}`,
    }),
  )
  return c.body(null, 200)
})
