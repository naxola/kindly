import {
  InvalidEmailWebhookError,
  parseResendWebhook,
  recordEmailSuppression,
} from '@saas/adapters/email'
import { emailWebhookEnv, parseEnv } from '@saas/config/env'
import { Hono } from 'hono'
import { db } from '../../db.ts'
import type { ApiEnv } from '../types.ts'

/**
 * Bounces and complaints from the email provider (ADR 0017). Outside /v1: no session or CSRF; the
 * signature is the authentication. A permanent bounce or a complaint puts the address (its hash)
 * on the suppression list. Idempotent, so the provider's retries are harmless.
 */
export const emailWebhookRoutes = new Hono<ApiEnv>().post('/webhooks/email', async (c) => {
  const { EMAIL_WEBHOOK_SECRET: secret } = parseEnv(emailWebhookEnv)
  if (!secret) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
  const log = c.get('log')
  const raw = await c.req.text()
  let event
  try {
    event = parseResendWebhook(raw, c.req.raw.headers, secret, new Date())
  } catch (err) {
    if (err instanceof InvalidEmailWebhookError) {
      log.warn({ reason: err.message }, 'email webhook rejected')
      return c.json({ error: { code: 'INVALID_SIGNATURE' } }, 401)
    }
    throw err
  }
  if (event.kind === 'suppress') {
    for (const email of event.recipients) {
      await recordEmailSuppression(db(), { email, reason: event.reason, sourceEventId: event.id })
    }
    // Never the addresses: only how many and why.
    log.info(
      { eventId: event.id, reason: event.reason, recipients: event.recipients.length },
      'email addresses suppressed',
    )
  }
  return c.body(null, 200)
})
