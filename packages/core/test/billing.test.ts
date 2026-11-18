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
  dunningEmail,
  RecordUsageInput,
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

describe('due periods (R1.6, ADR 0014)', () => {
  const sub = (patch: object) =>
    ({
      status: 'ACTIVE',
      planKey: 'pro',
      planVersion: 1,
      currentPeriodStart: d('2026-10-05T00:00:00Z'),
      currentPeriodEnd: d('2026-11-05T00:00:00Z'),
      createdAt: d('2026-09-05T00:00:00Z'),
      ...patch,
    }) as Subscription
  const period = (start: string, end: string, planVersion = 1) => ({
    start: d(start),
    end: d(end),
    planKey: 'pro',
    planVersion,
  })
  const SEP = period('2026-09-05T00:00:00Z', '2026-10-05T00:00:00Z')
  const OCT = period('2026-10-05T00:00:00Z', '2026-11-05T00:00:00Z')
  const opts = (o: object) => ({ catalog: TEST_CATALOG, ...o })

  it('a period is due once its end and the late-usage grace have passed', () => {
    const closed = new Set([SEP.start.getTime()])
    expect(duePeriods(sub({}), d('2026-11-05T00:30:00Z'), opts({ closedStarts: closed }))).toEqual(
      [],
    )
    expect(duePeriods(sub({}), d('2026-11-05T01:00:00Z'), opts({ closedStarts: closed }))).toEqual([
      OCT,
    ])
  })

  it('a legacy subscription (no history, nothing closed) also gets the period before the stored one', () => {
    expect(duePeriods(sub({}), d('2026-11-05T00:30:00Z'), opts({}))).toEqual([SEP])
    expect(duePeriods(sub({}), d('2026-11-05T01:00:00Z'), opts({}))).toEqual([SEP, OCT])
  })

  it('with the worker down for several periods, every unclosed one is returned, oldest first', () => {
    const due = duePeriods(
      sub({}),
      d('2027-01-06T00:00:00Z'),
      opts({ history: [SEP, OCT], closedStarts: new Set([SEP.start.getTime()]) }),
    )
    expect(due.map((p) => [p.start.toISOString(), p.end.toISOString()])).toEqual([
      ['2026-10-05T00:00:00.000Z', '2026-11-05T00:00:00.000Z'],
      ['2026-11-05T00:00:00.000Z', '2026-12-05T00:00:00.000Z'],
      ['2026-12-05T00:00:00.000Z', '2027-01-05T00:00:00.000Z'],
    ])
  })

  it('a renewal that arrives early does not close the period that just ended before its grace', () => {
    const renewed = sub({
      currentPeriodStart: d('2026-11-05T00:00:00Z'),
      currentPeriodEnd: d('2026-12-05T00:00:00Z'),
    })
    const o = opts({ history: [SEP, OCT], closedStarts: new Set([SEP.start.getTime()]) })
    expect(duePeriods(renewed, d('2026-11-05T00:30:00Z'), o)).toEqual([])
    expect(duePeriods(renewed, d('2026-11-05T01:00:00Z'), o)).toEqual([OCT])
  })

  it('each period keeps the plan that governed it', () => {
    const NOV_V2 = period('2026-11-05T00:00:00Z', '2026-12-05T00:00:00Z', 2)
    const due = duePeriods(
      sub({
        planVersion: 2,
        currentPeriodStart: NOV_V2.start,
        currentPeriodEnd: NOV_V2.end,
      }),
      d('2026-12-05T01:00:00Z'),
      opts({ history: [SEP, OCT, NOV_V2], closedStarts: new Set([SEP.start.getTime()]) }),
    )
    expect(due.map((p) => p.planVersion)).toEqual([1, 2])
    // Periods announced by no event are extrapolated with the last known plan.
    const later = duePeriods(
      sub({ planVersion: 2, currentPeriodStart: NOV_V2.start, currentPeriodEnd: NOV_V2.end }),
      d('2027-01-06T00:00:00Z'),
      opts({
        history: [NOV_V2],
        closedStarts: new Set([OCT.start.getTime()]),
      }),
    )
    expect(later.map((p) => p.planVersion)).toEqual([2, 2])
  })

  it('a canceled subscription closes its stored periods and nothing more; a new one has nothing due', () => {
    expect(
      duePeriods(sub({ status: 'CANCELED' }), d('2027-03-06T00:00:00Z'), opts({ history: [SEP] })),
    ).toEqual([SEP, OCT])
    expect(
      duePeriods(
        sub({ createdAt: d('2026-10-05T00:00:00Z') }),
        d('2026-10-20T00:00:00Z'),
        opts({}),
      ),
    ).toEqual([])
  })
})

describe('RecordUsageInput quantity', () => {
  const parse = (quantity: unknown) =>
    RecordUsageInput.safeParse({
      organizationId: '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      metric: 'm',
      quantity,
      idempotencyKey: 'k',
    }).success

  it('accepts only quantities greater than zero, as the database requires', () => {
    expect(parse(1)).toBe(true)
    expect(parse('0.5')).toBe(true)
    expect(parse(0)).toBe(false)
    expect(parse('0')).toBe(false)
    expect(parse('0.000')).toBe(false)
    expect(parse('-1')).toBe(false)
  })
})

describe('dunningEmail', () => {
  const base = {
    organizationName: 'Acme',
    restrictsOn: new Date('2026-11-13T00:00:00Z'),
    url: 'https://app.example.com/settings/billing',
  }
  it('explains each stage in both languages, with the date and the link', () => {
    for (const locale of ['es', 'en'] as const) {
      for (const kind of ['PAST_DUE', 'REMINDER', 'RESTRICTED'] as const) {
        const email = dunningEmail(locale, { ...base, kind })
        expect(email.subject).toContain('Acme')
        expect(email.text).toContain(base.url)
        expect(email.html).toContain(base.url)
      }
    }
    expect(dunningEmail('es', { ...base, kind: 'PAST_DUE' }).text).toContain('13 de noviembre')
    expect(dunningEmail('en', { ...base, kind: 'REMINDER' }).text).toContain('13 November')
    expect(dunningEmail('es', { ...base, kind: 'RESTRICTED' }).text).toContain('no se ha borrado')
  })
})
