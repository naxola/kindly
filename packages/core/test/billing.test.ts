import { describe, expect, it } from 'vitest'
import {
  addInterval,
  calendarMonth,
  CATALOG,
  defineCatalog,
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
