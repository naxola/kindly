import { defineJob } from '@saas/core'
import { createDb, newId, withTenant, type Db } from '@saas/database'
import { Writable } from 'node:stream'
import pino from 'pino'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createBoss,
  PgBossJobQueue,
  queueSnapshot,
  registerWorker,
  failedJobsSince,
  stuckQueues,
  syncQueues,
  type FinalFailure,
  type PgBoss,
} from '../src/queue/index.ts'

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
    const finals: FinalFailure[] = []
    await registerWorker(
      boss,
      failingJob,
      () => {
        attempts++
        return Promise.reject(new Error('boom'))
      },
      {
        log,
        onFinalFailure: (f) => {
          finals.push(f)
          throw new Error('the hook failing must not change anything')
        },
      },
    )
    const m = meta()
    const { id } = await withTenant(db, orgId, (tx) =>
      queue.enqueue(tx, failingJob, {}, { ...m, idempotencyKey: newId() }),
    )
    const job = await waitForState(failingJob.name, id, ['failed'], 25_000)
    expect(job.state).toBe('failed')
    expect(attempts).toBe(2)
    const lines = logLines.map(
      (l) => JSON.parse(l) as { msg: string; level: number; jobId?: string },
    )
    const mine = lines.filter((l) => l.jobId === id)
    // A failing hook is logged and changes nothing else.
    expect(mine.map((l) => l.msg)).toEqual([
      'job failed, will retry',
      'job failed permanently',
      'final failure hook failed',
    ])
    expect(mine[1]?.level).toBe(50) // error
    expect(finals).toHaveLength(1)
    expect(finals[0]).toMatchObject({
      job: failingJob.name,
      jobId: id,
      organizationId: orgId,
      correlationId: m.correlationId,
      attempt: 1,
    })

    const snapshot = await queueSnapshot(boss, { failures: 100 })
    expect(snapshot.queues.find((q) => q.name === failingJob.name)?.counts.failed).toBe(1)
    expect(snapshot.recentFailures.find((f) => f.id === id)).toMatchObject({
      name: failingJob.name,
      attempts: 2,
      correlationId: m.correlationId,
      message: 'boom',
    })
  })
})

describe('queue health', () => {
  it('a queue nobody consumes shows up as stuck', async () => {
    const idleJob = defineJob({ name: `test-${run}.idle`, schema: z.object({}) })
    const queue = new PgBossJobQueue(boss)
    await withTenant(db, orgId, (tx) =>
      queue.enqueue(tx, idleJob, {}, { ...meta(), idempotencyKey: newId() }),
    )
    // Pretend the job has been waiting for an hour.
    await boss
      .getDb()
      .executeSql(`UPDATE pgboss.job SET start_after = now() - interval '1 hour' WHERE name = $1`, [
        idleJob.name,
      ])
    const snapshot = await queueSnapshot(boss)
    const idle = snapshot.queues.find((q) => q.name === idleJob.name)
    expect(idle?.counts.created).toBe(1)
    expect(idle?.oldestWaitingSeconds).toBeGreaterThanOrEqual(3600)
    expect(stuckQueues(snapshot, 900).map((q) => q.name)).toContain(idleJob.name)
    expect(stuckQueues(snapshot, 7200).map((q) => q.name)).not.toContain(idleJob.name)
  })
})

describe('queue settings (R1.3)', () => {
  it('a queue redefined with other retries is updated in pg-boss when the consumer registers', async () => {
    const name = `test-${run}.redefined`
    const v1 = defineJob({ name, schema: z.object({}), retryLimit: 1, retryDelaySeconds: 1 })
    await syncQueues(boss, [v1])
    expect(await boss.getQueue(name)).toMatchObject({ retryLimit: 1, retryDelay: 1 })

    const v2 = defineJob({
      name,
      schema: z.object({}),
      retryLimit: 3,
      retryDelaySeconds: 7,
      expireInSeconds: 120,
    })
    // The producer only creates missing queues: it must not touch an existing one.
    await withTenant(db, orgId, (tx) =>
      new PgBossJobQueue(boss).enqueue(tx, v2, {}, { ...meta(), idempotencyKey: newId() }),
    )
    expect(await boss.getQueue(name)).toMatchObject({ retryLimit: 1, retryDelay: 1 })

    await registerWorker(boss, v2, () => Promise.resolve(), { log })
    expect(await boss.getQueue(name)).toMatchObject({
      retryLimit: 3,
      retryDelay: 7,
      retryBackoff: true,
      expireInSeconds: 120,
    })
  })
})

describe('failed jobs sweep (R1.3)', () => {
  it('finds jobs that failed without the handler running, only in the given queues and window', async () => {
    const name = `test-${run}.expired`
    const other = `test-${run}.expired-other`
    const job = defineJob({ name, schema: z.object({}), retryLimit: 0 })
    const otherJob = defineJob({ name: other, schema: z.object({}), retryLimit: 0 })
    await syncQueues(boss, [job, otherJob])
    const before = (await failedJobsSince(boss, [name], new Date())).now
    const m = meta()
    const ids: string[] = []
    for (const j of [job, otherJob]) {
      const { id } = await withTenant(db, orgId, (tx) =>
        queue.enqueue(
          tx,
          j,
          {},
          { ...m, idempotencyKey: newId(), startAfter: new Date(Date.now() + 3_600_000) },
        ),
      )
      ids.push(id)
    }
    // What pg-boss does when a job expires with no retries left.
    await boss
      .getDb()
      .executeSql(
        `UPDATE pgboss.job SET state = 'failed', completed_on = now(), output = '{"message":"job failed by expiration"}' WHERE id = ANY($1)`,
        [ids],
      )
    const { jobs, now } = await failedJobsSince(boss, [name], before)
    expect(jobs.map((j) => j.id)).toEqual([ids[0]])
    expect(jobs[0]).toMatchObject({
      name,
      correlationId: m.correlationId,
      organizationId: orgId,
      message: 'job failed by expiration',
    })
    // Nothing new after the returned clock.
    expect((await failedJobsSince(boss, [name], now)).jobs).toEqual([])
  })
})
