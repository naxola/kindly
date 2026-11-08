import { Prisma, type Subscription } from '@saas/database'
import { describe, expect, it } from 'vitest'
import {
  addInterval,
  amountDueOf,
  calendarMonth,
  CATALOG,
  defineCatalog,
  duePeriods,
  overageOf,
  periodContaining,
  publicPlans,
  quotaAlertEmail,
  type Catalog,
} from '../src/index.ts'
import { TEST_CATALOG } from './billing-catalog.ts'

const d = (iso: string) => new Date(iso)

describe('billing catalog', () => {
  it('the template ships a free default plan and no invented prices', () => {
    expect(CATALOG.plans).toHaveLength(1)
    expect(CATALOG.plans[0]).toMatchObject({ plan: 'free', price: '0' })
  })

  it('rejects inconsistent catalogs at load time', () => {
    const base = TEST_CATALOG
    const withPlan = (patch: object): Catalog => ({
      ...base,
      plans: [{ ...base.plans[0]!, ...patch }, ...base.plans.slice(1)],
    })
    expect(() => defineCatalog(withPlan({ quotas: {} }))).toThrow(/missing quota for api_calls/)
    expect(() => defineCatalog(withPlan({ features: ['nope'] }))).toThrow(/unknown feature nope/)
    expect(() => defineCatalog(withPlan({ price: '9.99' }))).toThrow(/default plan must be free/)
    expect(() =>
      defineCatalog(
        withPlan({
          quotas: { ...base.plans[0]!.quotas, api_calls: { included: '1', limit: 'soft' } },
        }),
      ),
    ).toThrow(/soft limit needs an overage price/)
    expect(() => defineCatalog({ ...base, plans: [...base.plans, base.plans[1]!] })).toThrow(
      /duplicated plan version pro@1/,
    )
  })

  it('offers only the latest public version of each plan', () => {
    expect(publicPlans(TEST_CATALOG).map((p) => `${p.plan}@${p.version}`)).toEqual([
      'free@1',
      'pro@2',
    ])
  })
})

describe('billing periods', () => {
  it('calendar month in UTC', () => {
    expect(calendarMonth(d('2026-11-30T23:59:59Z'))).toEqual({
      start: d('2026-11-01T00:00:00Z'),
      end: d('2026-12-01T00:00:00Z'),
    })
  })

  it('adding a month keeps the anchor day, clamped to the month length', () => {
    expect(addInterval(d('2026-01-31T10:00:00Z'), 'month')).toEqual(d('2026-02-28T10:00:00Z'))
    expect(addInterval(d('2026-01-31T10:00:00Z'), 'month', 2)).toEqual(d('2026-03-31T10:00:00Z'))
    expect(addInterval(d('2028-02-29T00:00:00Z'), 'year')).toEqual(d('2029-02-28T00:00:00Z'))
  })

  it('rolls a stored period forward when the renewal has not arrived', () => {
    const stored = { start: d('2026-09-15T00:00:00Z'), end: d('2026-10-15T00:00:00Z') }
    expect(periodContaining(stored, 'month', d('2026-10-01T00:00:00Z'))).toEqual(stored)
    expect(periodContaining(stored, 'month', d('2026-10-15T00:00:00Z'))).toEqual({
      start: d('2026-10-15T00:00:00Z'),
      end: d('2026-11-15T00:00:00Z'),
    })
    expect(periodContaining(stored, 'month', d('2026-12-20T00:00:00Z'))).toEqual({
      start: d('2026-12-15T00:00:00Z'),
      end: d('2027-01-15T00:00:00Z'),
    })
  })
})

describe('quota alert email', () => {
  it('explains the consequence of a hard limit', () => {
    const mail = quotaAlertEmail('es', {
      organizationName: 'Acme',
      metric: 'api_calls',
      unit: 'calls',
      threshold: 100,
      used: '100',
      included: '100',
      hardLimit: true,
      url: 'https://app.example.com/settings/billing',
    })
    expect(mail.subject).toBe('Acme: 100 % de la cuota de api_calls')
    expect(mail.text).toContain('se rechazarán')
    expect(mail.text).toContain('https://app.example.com/settings/billing')
  })
})

describe('overage', () => {
  const pro = TEST_CATALOG.plans.find((p) => p.plan === 'pro' && p.version === 1)!
  const usage = (calls: string, gb: string) =>
    new Map([
      ['api_calls', new Prisma.Decimal(calls)],
      ['storage_gb', new Prisma.Decimal(gb)],
      ['seats', new Prisma.Decimal(40)],
    ])

  it('charges only soft quotas beyond what is included, rounded per line', () => {
    const { lines, total } = overageOf(pro, usage('1505', '12.25'), TEST_CATALOG)
    expect(lines.map((l) => [l.metric, l.overageUnits.toString(), l.amount.toString()])).toEqual([
      ['api_calls', '505', '0.51'],
      ['storage_gb', '2.25', '1.13'],
      ['seats', '0', '0'],
    ])
    expect(total.toString()).toBe('1.64')
  })

  it('nothing beyond the quota, nothing to charge', () => {
    expect(overageOf(pro, usage('900', '3'), TEST_CATALOG).total.toString()).toBe('0')
  })

  it('the spend cap limits what is charged', () => {
    expect(amountDueOf(new Prisma.Decimal('80'), new Prisma.Decimal('50')).toString()).toBe('50')
    expect(amountDueOf(new Prisma.Decimal('8'), null).toString()).toBe('8')
  })
})

describe('due periods', () => {
  const pro = TEST_CATALOG.plans.find((p) => p.plan === 'pro' && p.version === 1)!
  const sub = (patch: object) =>
    ({
      status: 'ACTIVE',
      currentPeriodStart: d('2026-10-05T00:00:00Z'),
      currentPeriodEnd: d('2026-11-05T00:00:00Z'),
      createdAt: d('2026-09-05T00:00:00Z'),
      ...patch,
    }) as Subscription

  it('is the previous period once its end and the late-usage grace have passed', () => {
    expect(duePeriods(sub({}), pro, d('2026-11-05T00:30:00Z'))).toEqual([
      { start: d('2026-09-05T00:00:00Z'), end: d('2026-10-05T00:00:00Z') },
    ])
    expect(duePeriods(sub({}), pro, d('2026-11-05T01:00:00Z'))).toEqual([
      { start: d('2026-10-05T00:00:00Z'), end: d('2026-11-05T00:00:00Z') },
    ])
  })

  it('a canceled subscription closes its last period; a new one has nothing due', () => {
    expect(duePeriods(sub({ status: 'CANCELED' }), pro, d('2026-11-06T00:00:00Z'))).toHaveLength(1)
    expect(
      duePeriods(sub({ createdAt: d('2026-10-05T00:00:00Z') }), pro, d('2026-10-20T00:00:00Z')),
    ).toEqual([])
  })
})
