import type { EmailMessage, EmailSender } from '@saas/core'
import type { Db, EmailSuppressionReason } from '@saas/database'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { Logger } from '../logger/index.ts'

/**
 * Suppression list (ADR 0017): addresses that bounced for good or complained are not written to
 * again. Only the hash of the address is stored and logged.
 */
export const emailHash = (email: string) =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

/** Idempotent: the same address and reason are recorded once. */
export async function recordEmailSuppression(
  db: Db,
  entry: { email: string; reason: EmailSuppressionReason; sourceEventId?: string | null },
): Promise<void> {
  await db.emailSuppression.createMany({
    data: [
      {
        emailHash: emailHash(entry.email),
        reason: entry.reason,
        sourceEventId: entry.sourceEventId ?? null,
      },
    ],
    skipDuplicates: true,
  })
}

/** Reasons an address is suppressed for (empty: it can be written to). */
export async function emailSuppressions(db: Db, email: string): Promise<EmailSuppressionReason[]> {
  const rows = await db.emailSuppression.findMany({
    where: { emailHash: emailHash(email) },
    select: { reason: true },
  })
  return rows.map((r) => r.reason)
}

/** Lifts every suppression of an address (operations only). Returns how many were removed. */
export async function removeEmailSuppression(db: Db, email: string): Promise<number> {
  const { count } = await db.emailSuppression.deleteMany({ where: { emailHash: emailHash(email) } })
  return count
}

/**
 * Wraps a sender: a suppressed address is not written to. Access emails (verification, password
 * recovery) are only stopped by a permanent bounce, never by a complaint: a complaint about an
 * invitation must not lock someone out of their account.
 */
export class SuppressingEmailSender implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly db: Db,
    private readonly log: Logger,
  ) {}

  async send(message: EmailMessage) {
    const reasons = await emailSuppressions(this.db, message.to)
    const blocking =
      message.category === 'access' ? reasons.filter((r) => r === 'BOUNCE_PERMANENT') : reasons
    if (blocking.length > 0) {
      // Never the address: its hash is enough to find the entry.
      this.log.warn(
        { emailHash: emailHash(message.to), reasons: blocking, key: message.idempotencyKey },
        'email not sent: suppressed address',
      )
      return { providerMessageId: `suppressed:${message.idempotencyKey}`, suppressed: true }
    }
    return this.inner.send(message)
  }
}

export class InvalidEmailWebhookError extends Error {
  constructor(reason: string) {
    super(`Invalid email webhook: ${reason}`)
    this.name = 'InvalidEmailWebhookError'
  }
}

export type EmailWebhookEvent =
  | { kind: 'ignored'; id: string }
  | { kind: 'suppress'; id: string; reason: EmailSuppressionReason; recipients: string[] }

/** SUPUESTO: a webhook older or newer than this is refused (replay protection). */
const TOLERANCE_SECONDS = 5 * 60

/**
 * Verifies and reads a Resend webhook. Resend signs with Svix: HMAC-SHA256 over
 * `{svix-id}.{svix-timestamp}.{raw body}` with the base64 part of the `whsec_…` secret; the header
 * holds space-separated `v1,<base64>` signatures (any may match). Checked against the Svix and
 * Resend documentation on 2026-11-14. The body must be the raw text, never re-serialized JSON.
 */
export function parseResendWebhook(
  rawBody: string,
  headers: { get(name: string): string | null },
  secret: string,
  now: Date,
): EmailWebhookEvent {
  const id = headers.get('svix-id')
  const timestamp = headers.get('svix-timestamp')
  const signatures = headers.get('svix-signature')
  if (!id || !timestamp || !signatures) throw new InvalidEmailWebhookError('missing headers')
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds) || Math.abs(now.getTime() / 1000 - seconds) > TOLERANCE_SECONDS) {
    throw new InvalidEmailWebhookError('timestamp out of tolerance')
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest()
  const matches = signatures.split(' ').some((entry) => {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) return false
    const given = Buffer.from(value, 'base64')
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
  if (!matches) throw new InvalidEmailWebhookError('signature mismatch')

  let event: unknown
  try {
    event = JSON.parse(rawBody)
  } catch {
    throw new InvalidEmailWebhookError('body is not JSON')
  }
  const { type, data } = event as {
    type?: unknown
    data?: { to?: unknown; bounce?: { type?: unknown } }
  }
  const recipients = Array.isArray(data?.to)
    ? data.to.filter((t): t is string => typeof t === 'string' && t.includes('@'))
    : []
  if (recipients.length === 0) return { kind: 'ignored', id }
  if (type === 'email.complained') return { kind: 'suppress', id, reason: 'COMPLAINT', recipients }
  // Only permanent bounces: a temporary one (full inbox, server down) may deliver later.
  if (type === 'email.bounced' && data?.bounce?.type === 'Permanent') {
    return { kind: 'suppress', id, reason: 'BOUNCE_PERMANENT', recipients }
  }
  return { kind: 'ignored', id }
}
