import { createDb, newId, withTenant, type Db } from '@saas/database'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  billingStateOf,
  createOrganization,
  DomainError,
  ensureUser,
  getBillingOverview,
  recordUsage,
  requireFeature,
  resolveActor,
  type Ctx,
  type RecordUsageInput,
} from '../src/index.ts'
import { TEST_CATALOG } from './billing-catalog.ts'
import { RecordingQueue } from './fake-queue.ts'

let db: Db
let queue: RecordingQueue
const NOW = new Date('2026-11-10T12:00:00Z')
const base = () => ({
  db,
  queue,
  correlationId: newId(),
  appUrl: 'https://app.example.com',
  now: () => NOW,
})

beforeAll(() => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
})
afterAll(async () => {
  await db.$disconnect()
})

async function orgWithAdmin() {
  queue = new RecordingQueue()
  const access = await db.authUser.create({
    data: { id: newId(), email: `b-${newId()}@example.com`, name: 'B', emailVerified: true },
  })
  const user = await ensureUser(base(), access.id)
  const { organization } = await createOrganization(base(), user.id, {
    name: 'Acme',
    slug: `acme-${newId().slice(-12)}`,
  })
  const { actor } = await resolveActor(db, { userId: user.id, organizationId: organization.id })
  const ctx: Ctx = { ...base(), actor }
  return { orgId: organization.id, ctx }
}

const record = (orgId: string, input: Partial<RecordUsageInput> & { metric: string }) =>
  withTenant(db, orgId, (tx) =>
    recordUsage(
      base(),
      tx,
      { organizationId: orgId, quantity: 1, idempotencyKey: newId(), ...input },
      TEST_CATALOG,
    ),
  )

const subscribeToPro = (orgId: string) =>
  withTenant(db, orgId, (tx) =>
    tx.subscription.create({
      data: {
        organizationId: orgId,
        planKey: 'pro',
        planVersion: 1,
        status: 'ACTIVE',
        currentPeriodStart: new Date('2026-11-05T00:00:00Z'),
        currentPeriodEnd: new Date('2026-12-05T00:00:00Z'),
      },
    }),
  )

const errorOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code, detail: e.details?.[0]?.code }
    throw e
  }
  throw new Error('expected a DomainError')
}

describe('billing state', () => {
  it('without a subscription, the default plan applies on the calendar month', async () => {
    const { orgId } = await orgWithAdmin()
    const state = await withTenant(db, orgId, (tx) => billingStateOf(tx, orgId, NOW, TEST_CATALOG))
    expect(state.status).toBe('DEFAULT')
    expect(state.plan.plan).toBe('free')
    expect(state.period.start.toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })
})

describe('recordUsage', () => {
  it('adds up usage once per idempotency key', async () => {
    const { orgId } = await orgWithAdmin()
    const key = newId()
    expect(
      (await record(orgId, { metric: 'api_calls', quantity: 10, idempotencyKey: key })).recorded,
    ).toBe(true)
    const again = await record(orgId, { metric: 'api_calls', quantity: 10, idempotencyKey: key })
    expect(again.recorded).toBe(false)
    expect(again.used.toString()).toBe('10')
  })

  it('a hard limit rejects the effect and rolls the whole transaction back', async () => {
    const { orgId } = await orgWithAdmin()
    await record(orgId, { metric: 'api_calls', quantity: 95 })
    const rejected = await errorOf(
      withTenant(db, orgId, async (tx) => {
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorType: 'SYSTEM',
            action: 'test.effect',
            resourceType: 'x',
          },
        })
        await recordUsage(
          base(),
          tx,
          { organizationId: orgId, metric: 'api_calls', quantity: 10, idempotencyKey: newId() },
          TEST_CATALOG,
        )
      }),
    )
    expect(rejected).toEqual({ code: 'QUOTA_EXCEEDED', detail: 'QUOTA_EXCEEDED' })
    const effects = await withTenant(db, orgId, (tx) =>
      tx.auditLog.count({ where: { action: 'test.effect' } }),
    )
    expect(effects).toBe(0)
    expect((await record(orgId, { metric: 'api_calls', quantity: 5 })).used.toString()).toBe('100')
  })

  it('concurrent records never exceed a hard quota', async () => {
    const { orgId } = await orgWithAdmin()
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => record(orgId, { metric: 'api_calls', quantity: 30 })),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
  })

  it('notifies at 80 % and 100 %, once each per period', async () => {
    const { orgId } = await orgWithAdmin()
    await record(orgId, { metric: 'api_calls', quantity: 70 })
    expect(queue.of('billing.quota-alert-email')).toHaveLength(0)
    await record(orgId, { metric: 'api_calls', quantity: 15 })
    await record(orgId, { metric: 'api_calls', quantity: 1 })
    await record(orgId, { metric: 'api_calls', quantity: 14 })
    const alerts = queue.of('billing.quota-alert-email')
    expect(alerts.map((a) => (a.payload as { threshold: number }).threshold)).toEqual([80, 100])
    expect(alerts[1]!.payload).toMatchObject({ hardLimit: true, used: '100', included: '100' })
    expect(
      queue
        .of('events.deliver')
        .filter((e) => (e.payload as { type: string }).type === 'usage.threshold_reached'),
    ).toHaveLength(2)
  })

  it('max metrics keep the highest sample; unique metrics count distinct subjects', async () => {
    const { orgId } = await orgWithAdmin()
    await record(orgId, { metric: 'storage_gb', quantity: '0.4' })
    expect((await record(orgId, { metric: 'storage_gb', quantity: '0.9' })).used.toString()).toBe(
      '0.9',
    )
    expect((await record(orgId, { metric: 'storage_gb', quantity: '0.2' })).used.toString()).toBe(
      '0.9',
    )

    await record(orgId, { metric: 'seats', subjectKey: 'member-a' })
    await record(orgId, { metric: 'seats', subjectKey: 'member-a' })
    expect((await record(orgId, { metric: 'seats', subjectKey: 'member-b' })).used.toString()).toBe(
      '2',
    )
    expect(await errorOf(record(orgId, { metric: 'seats', subjectKey: 'member-c' }))).toMatchObject(
      {
        code: 'QUOTA_EXCEEDED',
      },
    )
  })

  it('a soft limit lets usage go beyond the quota (charged as overage)', async () => {
    const { orgId } = await orgWithAdmin()
    await subscribeToPro(orgId)
    const r = await record(orgId, { metric: 'api_calls', quantity: 1500 })
    expect(r.recorded).toBe(true)
    expect(r.used.toString()).toBe('1500')
  })
})

describe('entitlements and overview', () => {
  it('features come from the plan, not from permissions', async () => {
    const { orgId, ctx } = await orgWithAdmin()
    const check = () =>
      withTenant(db, orgId, (tx) => requireFeature(ctx, tx, 'exports', TEST_CATALOG))
    expect(await errorOf(check())).toEqual({ code: 'FORBIDDEN', detail: 'FEATURE_NOT_IN_PLAN' })
    await subscribeToPro(orgId)
    await expect(check()).resolves.toBeUndefined()
  })

  it('shows plan, period and usage of the active organization', async () => {
    const { orgId, ctx } = await orgWithAdmin()
    await subscribeToPro(orgId)
    await record(orgId, { metric: 'api_calls', quantity: 250 })
    const overview = await getBillingOverview(ctx, TEST_CATALOG)
    expect(overview.plan).toMatchObject({ key: 'pro', version: 1, price: '29' })
    expect(overview.period.start.toISOString()).toBe('2026-11-05T00:00:00.000Z')
    expect(overview.metrics.find((m) => m.key === 'api_calls')).toMatchObject({
      used: '250',
      included: '1000',
      percent: 25,
      limit: 'soft',
    })
    expect(overview.metrics.find((m) => m.key === 'seats')).toMatchObject({
      included: null,
      percent: null,
    })
  })

  it('MEMBERs cannot see billing', async () => {
    const { ctx } = await orgWithAdmin()
    const member: Ctx = { ...ctx, actor: { ...ctx.actor, role: 'MEMBER', permissions: new Set() } }
    expect(await errorOf(getBillingOverview(member, TEST_CATALOG))).toMatchObject({
      code: 'FORBIDDEN',
    })
  })
})

describe('usage isolation and integrity', () => {
  it('another organization never sees the usage, and usage cannot be edited', async () => {
    const a = await orgWithAdmin()
    const b = await orgWithAdmin()
    await record(a.orgId, { metric: 'api_calls', quantity: 7 })
    const seenByB = await withTenant(db, b.orgId, (tx) => tx.usageEvent.count())
    expect(seenByB).toBe(0)

    const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      await expect(client.query('UPDATE usage_events SET quantity = 0')).rejects.toThrow(
        /permission denied/,
      )
      await expect(client.query('DELETE FROM usage_events')).rejects.toThrow(/permission denied/)
    } finally {
      await client.end()
    }
  })
})
