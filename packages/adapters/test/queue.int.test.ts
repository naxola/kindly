import { defineJob } from '@saas/core'
import { createDb, newId, withTenant, type Db } from '@saas/database'
import { Writable } from 'node:stream'
import pino from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createBoss, PgBossJobQueue, registerWorker, type PgBoss } from '../src/queue/index.ts'

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
const run = newId().slice(-8)

const recordJob = defineJob({
  name: `test-${run}.record`,
  schema: z.object({ note: z.string().min(1) }),
  retryLimit: 1,
  retryDelaySeconds: 1,
})
const failingJob = defineJob({
  name: `test-${run}.fail`,
  schema: z.object({}),
  retryLimit: 1,
  retryDelaySeconds: 1,
})

let db: Db
let boss: PgBoss
let queue: PgBossJobQueue
let orgId: string

async function waitForState(name: string, id: string, states: string[], timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs
  for (;;) {
    const job = await boss.getJobById(name, id)
    if (job && states.includes(job.state)) return job
    if (Date.now() > until) throw new Error(`job ${id} stuck in ${job?.state}`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

beforeAll(async () => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  boss = createBoss({ connectionString: process.env.DATABASE_URL!, role: 'worker' })
  boss.on('error', () => undefined)
  await boss.start()
  queue = new PgBossJobQueue(boss)
  orgId = newId()
  await withTenant(db, orgId, (tx) =>
    tx.organization.create({ data: { id: orgId, name: 'q', slug: `q-${orgId}` } }),
  )
})

afterAll(async () => {
  await boss.stop({ graceful: false })
  await db.$disconnect()
})

const meta = () => ({ organizationId: orgId, correlationId: `corr-${newId()}` })

describe('transactional enqueue', () => {
  it('a job enqueued in a committed transaction exists', async () => {
    const { id, created } = await withTenant(db, orgId, (tx) =>
      queue.enqueue(tx, recordJob, { note: 'committed' }, { ...meta(), idempotencyKey: newId() }),
    )
    expect(created).toBe(true)
    expect(await boss.getJobById(recordJob.name, id)).not.toBeNull()
  })

  it('if the transaction rolls back, the job does not exist', async () => {
    let jobId = ''
    await expect(
      withTenant(db, orgId, async (tx) => {
        const key = newId()
        jobId = (
          await queue.enqueue(
            tx,
            recordJob,
            { note: 'rolled back' },
            { ...meta(), idempotencyKey: key },
          )
        ).id
        throw new Error('business failure')
      }),
    ).rejects.toThrow('business failure')
    expect(jobId).not.toBe('')
    expect(await boss.getJobById(recordJob.name, jobId)).toBeNull()
  })

  it('the same idempotency key creates a single job', async () => {
    const key = newId()
    const first = await withTenant(db, orgId, (tx) =>
      queue.enqueue(tx, recordJob, { note: 'once' }, { ...meta(), idempotencyKey: key }),
    )
    const second = await withTenant(db, orgId, (tx) =>
      queue.enqueue(tx, recordJob, { note: 'once' }, { ...meta(), idempotencyKey: key }),
    )
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.id).toBe(first.id)
  })

  it('validates the payload when enqueuing', async () => {
    await expect(
      withTenant(db, orgId, (tx) =>
        queue.enqueue(tx, recordJob, { note: '' }, { ...meta(), idempotencyKey: newId() }),
      ),
    ).rejects.toThrow()
  })
})

describe('worker', () => {
  it("processes the job in its organization's context, keeping the correlationId", async () => {
    await registerWorker(
      boss,
      recordJob,
      async (payload, ctx) => {
        await withTenant(db, ctx.organizationId!, (tx) =>
          tx.auditLog.create({
            data: {
              organizationId: ctx.organizationId,
              actorType: 'SYSTEM',
              action: 'test.record',
              resourceType: 'job',
              resourceId: ctx.jobId,
              correlationId: ctx.correlationId,
              after: { note: payload.note },
            },
          }),
        )
      },
      { log },
    )
    const m = meta()
    const { id } = await withTenant(db, orgId, (tx) =>
      queue.enqueue(tx, recordJob, { note: 'processed' }, { ...m, idempotencyKey: newId() }),
    )
    await waitForState(recordJob.name, id, ['completed'])
    const entry = await withTenant(db, orgId, (tx) =>
      tx.auditLog.findFirst({ where: { resourceId: id } }),
    )
    expect(entry?.correlationId).toBe(m.correlationId)
  })

  it('a failing job is retried and ends in a visible final failure', async () => {
    let attempts = 0
    await registerWorker(
      boss,
      failingJob,
      () => {
        attempts++
        return Promise.reject(new Error('boom'))
      },
      { log },
    )
    const { id } = await withTenant(db, orgId, (tx) =>
      queue.enqueue(tx, failingJob, {}, { ...meta(), idempotencyKey: newId() }),
    )
    const job = await waitForState(failingJob.name, id, ['failed'], 25_000)
    expect(job.state).toBe('failed')
    expect(attempts).toBe(2)
    const lines = logLines.map(
      (l) => JSON.parse(l) as { msg: string; level: number; jobId?: string },
    )
    const mine = lines.filter((l) => l.jobId === id)
    expect(mine.map((l) => l.msg)).toEqual(['job failed, will retry', 'job failed permanently'])
    expect(mine[1]?.level).toBe(50) // error
  })
})
