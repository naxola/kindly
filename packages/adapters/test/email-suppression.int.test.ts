import type { EmailMessage } from '@saas/core'
import { createDb, newId, type Db } from '@saas/database'
import { Writable } from 'node:stream'
import pino from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  emailHash,
  emailSuppressions,
  recordEmailSuppression,
  removeEmailSuppression,
  SuppressingEmailSender,
} from '../src/email/suppression.ts'

let db: Db
const logLines: string[] = []
const log = pino(
  { level: 'info' },
  new Writable({
    write(chunk: Buffer, _enc, cb) {
      logLines.push(chunk.toString())
      cb()
    },
  }),
)
beforeAll(() => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
})
afterAll(() => db.$disconnect())

const address = () => `Person-${newId()}@Example.com`
const message = (to: string, category?: EmailMessage['category']): EmailMessage => ({
  to,
  subject: 's',
  html: '<p>h</p>',
  text: 't',
  idempotencyKey: `k-${newId()}`,
  ...(category ? { category } : {}),
})

function sender() {
  const sent: EmailMessage[] = []
  const guarded = new SuppressingEmailSender(
    {
      send: (m) => {
        sent.push(m)
        return Promise.resolve({ providerMessageId: 'real' })
      },
    },
    db,
    log,
  )
  return { sent, guarded }
}

describe('email suppression (ADR 0017)', () => {
  it('stores only the hash of the normalized address, once per reason', async () => {
    const email = address()
    await recordEmailSuppression(db, { email, reason: 'COMPLAINT', sourceEventId: 'msg_1' })
    await recordEmailSuppression(db, { email: email.toLowerCase(), reason: 'COMPLAINT' })
    await recordEmailSuppression(db, { email: ` ${email} `, reason: 'BOUNCE_PERMANENT' })
    const rows = await db.emailSuppression.findMany({ where: { emailHash: emailHash(email) } })
    expect(rows.map((r) => r.reason).sort()).toEqual(['BOUNCE_PERMANENT', 'COMPLAINT'])
    expect(emailHash(email)).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(rows).toLowerCase()).not.toContain('example.com')
    expect(await emailSuppressions(db, email.toUpperCase())).toHaveLength(2)
  })

  it('does not send to a suppressed address, and logs the hash, never the address', async () => {
    const email = address()
    await recordEmailSuppression(db, { email, reason: 'COMPLAINT' })
    const { sent, guarded } = sender()
    logLines.length = 0
    const result = await guarded.send(message(email))
    expect(result.suppressed).toBe(true)
    expect(sent).toEqual([])
    const logged = logLines.join('')
    expect(logged).toContain(emailHash(email))
    expect(logged.toLowerCase()).not.toContain(email.toLowerCase())
  })

  it('a complaint does not stop access emails; a permanent bounce does', async () => {
    const complained = address()
    await recordEmailSuppression(db, { email: complained, reason: 'COMPLAINT' })
    const a = sender()
    expect((await a.guarded.send(message(complained, 'access'))).suppressed).toBeUndefined()
    expect(a.sent).toHaveLength(1)

    const bounced = address()
    await recordEmailSuppression(db, { email: bounced, reason: 'BOUNCE_PERMANENT' })
    const b = sender()
    expect((await b.guarded.send(message(bounced, 'access'))).suppressed).toBe(true)
    expect(b.sent).toEqual([])
  })

  it('sends normally to everyone else, and again after lifting a suppression', async () => {
    const email = address()
    const { sent, guarded } = sender()
    expect(await guarded.send(message(email))).toEqual({ providerMessageId: 'real' })
    await recordEmailSuppression(db, { email, reason: 'BOUNCE_PERMANENT' })
    expect((await guarded.send(message(email))).suppressed).toBe(true)
    expect(await removeEmailSuppression(db, email)).toBe(1)
    expect(await removeEmailSuppression(db, email)).toBe(0)
    expect((await guarded.send(message(email))).suppressed).toBeUndefined()
    expect(sent).toHaveLength(2)
  })
})
