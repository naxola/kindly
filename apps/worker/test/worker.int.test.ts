import type { Alert } from '@saas/adapters/alerts'
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
const alerts: Alert[] = []
const HEALTH_PORT = 3902

let db: Db
let producer: PgBoss
let worker: RunningWorker

beforeAll(async () => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  worker = await startWorker({
    env: loadEnv({
      ...process.env,
      APP_URL: 'https://app.example.com',
      WORKER_HEALTH_PORT: String(HEALTH_PORT),
    }),
    alerts: {
      send: (a) => {
        alerts.push(a)
        return Promise.resolve()
      },
    },
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
  it('consumes every template queue and registers the schedules', async () => {
    expect(worker.queues).toHaveLength(9)
    const schedules = await worker.boss.getSchedules()
    expect(schedules.map((x) => [x.name, x.cron])).toContainEqual([
      'billing.close-due-periods',
      '7 * * * *',
    ])
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
    expect(email.text).toContain(`https://app.example.com/invite#${token}`)
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

describe('worker health', () => {
  it('answers /health and /ready', async () => {
    const health = await fetch(`http://127.0.0.1:${HEALTH_PORT}/health`)
    const ready = await fetch(`http://127.0.0.1:${HEALTH_PORT}/ready`)
    const other = await fetch(`http://127.0.0.1:${HEALTH_PORT}/other`)
    expect([health.status, ready.status, other.status]).toEqual([200, 200, 404])
  })

  it('alerts when a queue is not draining', async () => {
    const name = `test-stuck-${newId().slice(-8)}`
    await producer.createQueue(name)
    await producer.send(name, {})
    await producer
      .getDb()
      .executeSql(`UPDATE pgboss.job SET start_after = now() - interval '1 hour' WHERE name = $1`, [
        name,
      ])
    await worker.checkQueues()
    const alert = alerts.find((a) => a.key === `queue-stuck:${name}`)
    expect(alert?.severity).toBe('warning')
    expect(alert?.body).toContain('60 min')
  })
})
