import type { Alert } from '@saas/adapters/alerts'
import { createLogger } from '@saas/adapters/logger'
import { createBoss, PgBossJobQueue, type PgBoss } from '@saas/adapters/queue'
import {
  createInvitation,
  createMessagingRegistry,
  createOrganization,
  ensureUser,
  FakeEmbeddingProvider,
  FakeMessagingAdapter,
  submitDocument,
  receiveWebhook,
  resolveActor,
  type BusinessEvent,
  type EmailMessage,
} from '@saas/core'
import { createDb, newId, withTenant, type Db } from '@saas/database'
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
const fake = new FakeMessagingAdapter('s3cret')

let db: Db
let producer: PgBoss
let worker: RunningWorker

beforeAll(async () => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  // Jobs enqueued by the test files that ran before (API journeys enqueue emails and events)
  // would make the worker chew through a backlog before reaching this file's own jobs: the
  // wait below would then depend on how many tests ran earlier.
  await db.$executeRaw`DELETE FROM pgboss.job`
  worker = await startWorker({
    messaging: createMessagingRegistry([fake]),
    embeddings: new FakeEmbeddingProvider(),
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

async function untilAsync<T>(read: () => Promise<T | undefined>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error('timed out waiting for the worker')
    await new Promise((r) => setTimeout(r, 200))
  }
}

describe('worker', () => {
  it('consumes every template queue and registers the schedules', async () => {
    expect(worker.queues).toHaveLength(11)
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

  it('processes a stored webhook: contact, conversation and message appear', async () => {
    const ctx = {
      db,
      queue: new PgBossJobQueue(producer),
      correlationId: newId(),
      appUrl: 'https://app.example.com',
    }
    const access = await db.authUser.create({
      data: {
        id: newId(),
        email: `hook-${newId()}@example.com`,
        name: 'Hook',
        emailVerified: true,
      },
    })
    const user = await ensureUser(ctx, access.id)
    const { organization, member } = await createOrganization(ctx, user.id, {
      name: 'Hooks',
      slug: `hooks-${newId().slice(-12)}`,
    })
    const account = await withTenant(db, organization.id, (tx) =>
      tx.messagingAccount.create({
        data: {
          organizationId: organization.id,
          delegateId: member.id,
          channel: 'fake',
          externalAccountId: `acc-${newId()}`,
          status: 'CONNECTED',
        },
      }),
    )
    const outcome = await receiveWebhook(
      { db, queue: ctx.queue, registry: createMessagingRegistry([fake]), correlationId: newId() },
      'fake',
      account.id,
      JSON.stringify({
        kind: 'MESSAGE',
        externalConversationId: 'chat-w',
        externalMessageId: 'msg-w',
        externalContactId: 'ext',
        contactDisplayName: 'Desde el worker',
        text: 'Hola',
      }),
      fake.signatureHeaders(),
    )
    expect(outcome.status).toBe(200)
    const done = await untilAsync(() =>
      withTenant(db, organization.id, async (tx) => {
        const m = await tx.message.findFirst({
          include: { conversation: { include: { contact: true } } },
        })
        return m ?? undefined
      }),
    )
    expect(done.body).toBe('Hola')
    expect(done.conversation.contact.name).toBe('Desde el worker')
  })

  it('ingests an uploaded knowledge version: pending, then ready with its chunks and without the bytes', async () => {
    const ctx = {
      db,
      queue: new PgBossJobQueue(producer),
      correlationId: newId(),
      appUrl: 'https://app.example.com',
    }
    const access = await db.authUser.create({
      data: { id: newId(), email: `kb-${newId()}@example.com`, name: 'KB', emailVerified: true },
    })
    const user = await ensureUser(ctx, access.id)
    const { organization } = await createOrganization(ctx, user.id, {
      name: 'Saber',
      slug: `saber-${newId().slice(-12)}`,
    })
    const { actor } = await resolveActor(db, { userId: user.id, organizationId: organization.id })
    const { versionId } = await submitDocument(
      { ...ctx, actor },
      { title: 'Manual interno' },
      { version: '1', effectiveFrom: '2026-01-01' },
      {
        kind: 'TEXT',
        data: new TextEncoder().encode('Artículo 1\nLas altas se tramitan en una semana.'),
      },
    )
    const done = await untilAsync(() =>
      withTenant(db, organization.id, async (tx) => {
        const v = await tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: versionId } })
        return v.ingestionStatus === 'READY' ? v : undefined
      }),
    )
    expect(done).toMatchObject({ status: 'CURRENT', sourceData: null, ingestionError: null })
    const [row] = await withTenant(
      db,
      organization.id,
      (tx) =>
        tx.$queryRaw<
          { n: bigint }[]
        >`SELECT count(*) AS n FROM knowledge_chunks WHERE document_version_id = ${versionId}::uuid`,
    )
    expect(Number(row?.n)).toBe(1)
  })
})
