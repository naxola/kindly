import { describe, expect, it } from 'vitest'
import { AffiliationInput, firstUnpaidMonth, isFeeOverdue } from '../src/index.ts'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)
const now = d('2026-09-15')

describe('isFeeOverdue', () => {
  it('is never overdue while INACTIVE, whatever the fee', () => {
    expect(isFeeOverdue({ status: 'INACTIVE', feePaidUntil: d('2020-01-01') }, now)).toBe(false)
  })
  it('is never overdue with no fee ever recorded', () => {
    expect(isFeeOverdue({ status: 'ACTIVE', feePaidUntil: null }, now)).toBe(false)
  })
  it('is overdue when paid through a month before the current one', () => {
    expect(isFeeOverdue({ status: 'ACTIVE', feePaidUntil: d('2026-08-01') }, now)).toBe(true)
  })
  it('is not overdue when paid through the current month or ahead', () => {
    expect(isFeeOverdue({ status: 'ACTIVE', feePaidUntil: d('2026-09-01') }, now)).toBe(false)
    expect(isFeeOverdue({ status: 'ACTIVE', feePaidUntil: d('2027-01-01') }, now)).toBe(false)
  })
})

describe('firstUnpaidMonth', () => {
  it('is the month right after the last paid one, across the year boundary', () => {
    expect(firstUnpaidMonth(d('2026-03-01')).toISOString().slice(0, 10)).toBe('2026-04-01')
    expect(firstUnpaidMonth(d('2026-12-01')).toISOString().slice(0, 10)).toBe('2027-01-01')
  })
})

describe('AffiliationInput', () => {
  it('turns a month or a date into the first day of that month, and blank into null', () => {
    const iso = (v: Date | null | undefined) => v?.toISOString().slice(0, 10)
    expect(iso(AffiliationInput.parse({ feePaidUntil: '2026-09' }).feePaidUntil)).toBe('2026-09-01')
    expect(iso(AffiliationInput.parse({ feePaidUntil: '2026-09-23' }).feePaidUntil)).toBe(
      '2026-09-01',
    )
    expect(AffiliationInput.parse({ feePaidUntil: '', memberNumber: '  ' })).toMatchObject({
      feePaidUntil: null,
      memberNumber: null,
    })
  })
  it('rejects an impossible month or date', () => {
    expect(() => AffiliationInput.parse({ feePaidUntil: '2026-13' })).toThrow()
    expect(() => AffiliationInput.parse({ startedAt: 'mañana' })).toThrow()
  })
})
