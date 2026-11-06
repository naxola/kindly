import { createLogger } from '@saas/adapters/logger'
import { createBoss, PgBossJobQueue, type PgBoss } from '@saas/adapters/queue'
import {
  createInvitation,
  createOrganization,
  ensureUser,
  resolveActor,
  type BusinessEvent,
  type EmailMessage,
} from '@saas/core'
import { createDb, newId, type Db } from '@saas/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env.ts'
import { startWorker, type RunningWorker } from '../src/worker.ts'

/**
 * Phase 3 end to end: a use case enqueues in its transaction (web role: producer), the
 * worker consumes, sends the email and delivers the business events.
 */
const sent: EmailMessage[] = []
const delivered: BusinessEvent[] = []

let db: Db
let producer: PgBoss
let worker: RunningWorker

beforeAll(async () => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  worker = await startWorker({
    env: loadEnv({ ...process.env, APP_URL: 'https://app.example.com' }),
    log: createLogger({ level: 'silent', service: 'worker-test' }),
    email: {
      send: (m) => {
        sent.push(m)
        return Promise.resolve({ providerMessageId: `test:${m.idempotencyKey}` })
      },
    },
    events: {
      deliver: (e) => {
        delivered.push(e)
        return Promise.resolve()
      },
    },
  })
  producer = createBoss({ connectionString: process.env.DATABASE_URL!, role: 'producer' })
  producer.on('error', () => undefined)
  await producer.start()
})

afterAll(async () => {
  await producer.stop({ graceful: false })
  await worker.stop()
  await db.$disconnect()
})

async function until<T>(read: () => T | undefined, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = read()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error('timed out waiting for the worker')
    await new Promise((r) => setTimeout(r, 200))
  }
}

describe('worker', () => {
  it('consumes every template queue', () => {
    expect(worker.queues).toHaveLength(4)
  })

  it('sends the invitation email and delivers the business events', async () => {
    const ctx = {
      db,
      queue: new PgBossJobQueue(producer),
      correlationId: newId(),
      appUrl: 'https://app.example.com',
    }
    const access = await db.authUser.create({
      data: {
        id: newId(),
        email: `owner-${newId()}@example.com`,
        name: 'Owner',
        emailVerified: true,
      },
    })
    const user = await ensureUser(ctx, access.id)
    const { organization } = await createOrganization(ctx, user.id, {
      name: 'Acme',
      slug: `acme-${newId().slice(-12)}`,
    })
    const { actor } = await resolveActor(db, { userId: user.id, organizationId: organization.id })
    const guest = `guest-${newId()}@example.com`
    const { invitation, token } = await createInvitation({ ...ctx, actor }, { email: guest })

    const email = await until(() => sent.find((m) => m.to === guest))
    expect(email.subject).toBe('Invitación a Acme')
    expect(email.text).toContain(`https://app.example.com/invitations/${token}`)
    expect(email.idempotencyKey).toMatch(/^identity\.invitation-email:/)

    const types = await until(() => {
      const mine = delivered.filter(
        (e) => e.organizationId === organization.id || e.data.userId === user.id,
      )
      return mine.length >= 3 ? mine.map((e) => e.type).sort() : undefined
    })
    expect(types).toEqual(['invitation.created', 'organization.created', 'user.created'])
    const created = delivered.find((e) => e.data.invitationId === invitation.id)
    expect(created?.type).toBe('invitation.created')
  })
})
