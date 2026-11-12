import { createDb, newId, withTenant, type Db } from '@saas/database'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  applyProviderEvent,
  billingChargeHandler,
  billingCloseHandlers,
  chargePeriodJob,
  billingStateOf,
  closeDuePeriods,
  createOrganization,
  DomainError,
  ensureUser,
  getBillingOverview,
  listBillingPeriods,
  recordUsage,
  requireFeature,
  resolveActor,
  setSpendCap,
  startCheckout,
  type Ctx,
  type OverageCharge,
  type PaymentProvider,
  type ProviderEvent,
  type ProviderSubscription,
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

describe('period close (B4)', () => {
  const OCT = { start: new Date('2026-10-05T00:00:00Z'), end: new Date('2026-11-05T00:00:00Z') }

  const subscribeSince = (orgId: string, spendCap: string | null = null) =>
    withTenant(db, orgId, (tx) =>
      tx.subscription.create({
        data: {
          organizationId: orgId,
          planKey: 'pro',
          planVersion: 1,
          status: 'ACTIVE',
          currentPeriodStart: OCT.start,
          currentPeriodEnd: OCT.end,
          spendCap,
          createdAt: new Date('2026-10-05T00:00:00Z'),
        },
      }),
    )

  const close = (orgId: string) =>
    withTenant(db, orgId, (tx) => closeDuePeriods(base(), tx, orgId, TEST_CATALOG))

  it('stores an immutable snapshot of the period once, with its overage', async () => {
    const { orgId, ctx } = await orgWithAdmin()
    await subscribeSince(orgId)
    const inOctober = new Date('2026-10-20T10:00:00Z')
    await record(orgId, { metric: 'api_calls', quantity: 1500, occurredAt: inOctober })
    await record(orgId, { metric: 'storage_gb', quantity: '12', occurredAt: inOctober })
    // Usage of the next period does not count for October.
    await record(orgId, { metric: 'api_calls', quantity: 999, occurredAt: NOW })

    const [period] = await close(orgId)
    expect(period).toMatchObject({ status: 'PENDING_CHARGE', planKey: 'pro', currency: 'EUR' })
    expect(period!.periodStart.toISOString()).toBe(OCT.start.toISOString())
    expect(period!.overageTotal.toString()).toBe('1.5') // 500 × 0.001 + 2 × 0.5
    expect(await close(orgId)).toEqual([])

    const [listed] = await listBillingPeriods(ctx)
    expect(listed!.lines.find((l) => l.metric === 'api_calls')).toMatchObject({
      used: '1500',
      overageUnits: '500',
      amount: '0.5',
    })
    expect(
      queue
        .of('events.deliver')
        .some((e) => (e.payload as { type: string }).type === 'billing.period_closed'),
    ).toBe(true)
  })

  it('the spend cap limits the amount due and blocks usage beyond it', async () => {
    const { orgId } = await orgWithAdmin()
    await subscribeSince(orgId, '1.00')
    const inOctober = new Date('2026-10-20T10:00:00Z')
    await record(orgId, { metric: 'api_calls', quantity: 1900, occurredAt: inOctober })
    expect(
      await errorOf(record(orgId, { metric: 'api_calls', quantity: 200, occurredAt: inOctober })),
    ).toEqual({ code: 'QUOTA_EXCEEDED', detail: 'SPEND_CAP_REACHED' })
    const [period] = await close(orgId)
    expect(period!.amountDue.toString()).toBe('0.9')
  })

  it('only an ADMIN with a subscription sets the spend cap', async () => {
    const { orgId, ctx } = await orgWithAdmin()
    expect(await errorOf(setSpendCap(ctx, { spendCap: '50' }))).toEqual({
      code: 'CONFLICT',
      detail: 'NO_SUBSCRIPTION',
    })
    await subscribeSince(orgId)
    expect(await setSpendCap(ctx, { spendCap: '50' })).toEqual({ spendCap: '50' })
    const member: Ctx = { ...ctx, actor: { ...ctx.actor, role: 'MEMBER', permissions: new Set() } }
    expect(await errorOf(setSpendCap(member, { spendCap: null }))).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('a closed period cannot be altered; only how it was charged', async () => {
    const { orgId } = await orgWithAdmin()
    await subscribeSince(orgId)
    await record(orgId, {
      metric: 'api_calls',
      quantity: 1200,
      occurredAt: new Date('2026-10-20T10:00:00Z'),
    })
    const [period] = await close(orgId)
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    try {
      await client.query(`SELECT set_config('app.org_id', $1, false)`, [orgId])
      await expect(
        client.query('UPDATE billing_periods SET amount_due = 0 WHERE id = $1', [period!.id]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        client.query('UPDATE billing_period_lines SET amount = 0 WHERE period_id = $1', [
          period!.id,
        ]),
      ).rejects.toThrow(/permission denied/)
      const ok = await client.query(
        `UPDATE billing_periods SET status = 'CHARGED', charged_at = now() WHERE id = $1`,
        [period!.id],
      )
      expect(ok.rowCount).toBe(1)
    } finally {
      await client.end()
    }
  })

  it('the hourly scan enqueues one close per organization with a subscription', async () => {
    const { orgId } = await orgWithAdmin()
    await subscribeSince(orgId)
    const scanQueue = new RecordingQueue()
    await billingCloseHandlers({
      db,
      queue: scanQueue,
      appUrl: 'https://app.example.com',
      now: () => NOW,
      catalog: TEST_CATALOG,
    }).scan({}, { organizationId: null, correlationId: 'scan', jobId: 'j', attempt: 0 })
    const mine = scanQueue
      .of('billing.close-periods')
      .filter((j) => j.options.organizationId === orgId)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.options.idempotencyKey).toBe(`close:${orgId}:2026-11-10T12`)
  })
})

describe('payment provider (B3 + B5)', () => {
  const event = (
    orgId: string,
    patch: Partial<ProviderSubscription> = {},
    at = '2026-11-05T00:00:05Z',
    id = newId(),
  ) => ({
    id,
    occurredAt: new Date(at),
    kind: 'subscription' as const,
    subscription: {
      ref: `sub_${orgId}`,
      customerRef: 'ctm_1',
      status: 'ACTIVE' as const,
      priceId: 'pri_test_pro_2',
      periodStart: new Date('2026-11-05T00:00:00Z'),
      periodEnd: new Date('2026-12-05T00:00:00Z'),
      cancelAtPeriodEnd: false,
      organizationId: orgId,
      ...patch,
    },
  })
  const apply = (orgId: string, e: ProviderEvent, now = NOW) =>
    withTenant(db, orgId, (tx) =>
      applyProviderEvent({ ...base(), now: () => now }, tx, orgId, e, 'paddle', TEST_CATALOG),
    )
  const stateAt = (orgId: string, at: Date) =>
    withTenant(db, orgId, (tx) => billingStateOf(tx, orgId, at, TEST_CATALOG))

  it('a subscription event puts the organization on the plan of its price', async () => {
    const { orgId } = await orgWithAdmin()
    expect((await apply(orgId, event(orgId))).applied).toBe(true)
    const state = await stateAt(orgId, NOW)
    expect(state).toMatchObject({ status: 'ACTIVE', restricted: false })
    expect(`${state.plan.plan}@${state.plan.version}`).toBe('pro@2')
    expect(
      queue
        .of('events.deliver')
        .some((j) => (j.payload as { type: string }).type === 'billing.subscription_changed'),
    ).toBe(true)
  })

  it('older events arriving late are ignored', async () => {
    const { orgId } = await orgWithAdmin()
    await apply(orgId, event(orgId, { status: 'CANCELED' }, '2026-11-06T00:00:00Z'))
    expect((await apply(orgId, event(orgId, {}, '2026-11-05T00:00:00Z'))).applied).toBe(false)
    expect((await stateAt(orgId, NOW)).status).toBe('DEFAULT')
  })

  it('past due keeps the plan during the grace period, then falls back (data kept)', async () => {
    const { orgId } = await orgWithAdmin()
    await apply(orgId, event(orgId))
    await apply(
      orgId,
      event(orgId, { status: 'PAST_DUE' }, '2026-11-06T00:00:00Z'),
      new Date('2026-11-06T00:00:00Z'),
    )
    const during = await stateAt(orgId, new Date('2026-11-10T00:00:00Z'))
    expect(during).toMatchObject({ status: 'PAST_DUE', restricted: false })
    expect(during.plan.plan).toBe('pro')
    const after = await stateAt(orgId, new Date('2026-11-14T00:00:00Z'))
    expect(after).toMatchObject({ status: 'PAST_DUE', restricted: true })
    expect(after.plan.plan).toBe('free')
    // Paying again restores the plan.
    await apply(orgId, event(orgId, {}, '2026-11-15T00:00:00Z'))
    expect((await stateAt(orgId, new Date('2026-11-15T00:00:01Z'))).restricted).toBe(false)
  })

  it('an unknown provider price fails loudly (the job is retried and alerted)', async () => {
    const { orgId } = await orgWithAdmin()
    await expect(apply(orgId, event(orgId, { priceId: 'pri_unknown' }))).rejects.toThrow(
      /pri_unknown/,
    )
  })

  it('checkout: only with a provider, a public paid plan and no live subscription', async () => {
    const { orgId, ctx } = await orgWithAdmin()
    const provider = fakeProvider()
    expect(await errorOf(startCheckout(ctx, null, { plan: 'pro' }, null, TEST_CATALOG))).toEqual({
      code: 'CONFLICT',
      detail: 'PAYMENTS_DISABLED',
    })
    expect(
      await errorOf(startCheckout(ctx, provider, { plan: 'gold' }, null, TEST_CATALOG)),
    ).toMatchObject({
      detail: 'PLAN_NOT_FOUND',
    })
    const session = await startCheckout(ctx, provider, { plan: 'pro' }, 'a@b.test', TEST_CATALOG)
    expect(session).toMatchObject({
      priceId: 'pri_test_pro_2',
      customData: { organizationId: orgId },
    })
    await apply(orgId, event(orgId))
    expect(
      await errorOf(startCheckout(ctx, provider, { plan: 'pro' }, null, TEST_CATALOG)),
    ).toMatchObject({
      detail: 'ALREADY_SUBSCRIBED',
    })
  })

  it('a closed period with amount due is charged once; a failed charge is marked and not retried', async () => {
    const { orgId } = await orgWithAdmin()
    await withTenant(db, orgId, (tx) =>
      tx.subscription.create({
        data: {
          organizationId: orgId,
          planKey: 'pro',
          planVersion: 1,
          status: 'ACTIVE',
          currentPeriodStart: new Date('2026-10-05T00:00:00Z'),
          currentPeriodEnd: new Date('2026-11-05T00:00:00Z'),
          createdAt: new Date('2026-10-05T00:00:00Z'),
          provider: 'paddle',
          providerSubscriptionId: `sub_${newId()}`,
          providerCustomerId: 'ctm_1',
        },
      }),
    )
    await record(orgId, {
      metric: 'api_calls',
      quantity: 3000,
      occurredAt: new Date('2026-10-20T00:00:00Z'),
    })
    const [period] = await withTenant(db, orgId, (tx) =>
      closeDuePeriods(base(), tx, orgId, TEST_CATALOG),
    )
    const charge = queue
      .of('billing.charge-period')
      .find((j) => (j.payload as { periodId: string }).periodId === period!.id)
    expect(charge?.options.idempotencyKey).toBe(`charge:${period!.id}`)
    expect(chargePeriodJob.retryLimit).toBe(0)

    const failing = fakeProvider(new Error('Paddle 400 subscription_is_past_due'))
    const jobCtx = { organizationId: orgId, correlationId: 'c', jobId: 'j', attempt: 0 }
    await expect(
      billingChargeHandler({ db, provider: failing })(
        { organizationId: orgId, periodId: period!.id },
        jobCtx,
      ),
    ).rejects.toThrow('past_due')
    const statusOf = () =>
      withTenant(db, orgId, (tx) =>
        tx.billingPeriod.findUniqueOrThrow({ where: { id: period!.id } }),
      )
    expect((await statusOf()).status).toBe('CHARGE_FAILED')

    const ok = fakeProvider()
    await billingChargeHandler({ db, provider: ok })(
      { organizationId: orgId, periodId: period!.id },
      jobCtx,
    )
    expect(ok.charges).toEqual([expect.objectContaining({ amount: '2.00', currency: 'EUR' })])
    expect((await statusOf()).status).toBe('CHARGED')
    // A second run (manual retry) does not charge again.
    await billingChargeHandler({ db, provider: ok })(
      { organizationId: orgId, periodId: period!.id },
      jobCtx,
    )
    expect(ok.charges).toHaveLength(1)
  })
})

function fakeProvider(failWith?: Error) {
  const charges: OverageCharge[] = []
  const provider: PaymentProvider & { charges: OverageCharge[] } = {
    name: 'paddle',
    charges,
    checkout: (i) => ({
      provider: 'paddle',
      environment: 'sandbox',
      clientToken: 'tok',
      priceId: i.priceId,
      customData: { organizationId: i.organizationId },
      customerEmail: i.customerEmail,
    }),
    portalUrl: () => Promise.resolve('https://portal.test'),
    chargeOverage: (c) =>
      failWith ? Promise.reject(failWith) : (charges.push(c), Promise.resolve()),
    parseWebhook: () => {
      throw new Error('not used')
    },
  }
  return provider
}
