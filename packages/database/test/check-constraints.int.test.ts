import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, newId, withTenant, type Db, type TenantTx } from '../src/index.ts'

/**
 * Dates are far in the future on purpose: the worker's hourly billing scan shares this database
 * and must not find a period to close in this fixture.
 *
 * CHECK constraints of the billing tables (R3.1): the database refuses nonsensical amounts and
 * periods even if the application has a bug. SQLSTATE 23514 = check_violation.
 */
let db: Db
let orgId: string
let subscriptionId: string
let billingPeriodId: string

beforeAll(async () => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  orgId = newId()
  subscriptionId = newId()
  billingPeriodId = newId()
  await withTenant(db, orgId, async (tx) => {
    await tx.organization.create({ data: { id: orgId, name: 'Checks', slug: `checks-${orgId}` } })
    await tx.$executeRaw`
      INSERT INTO subscriptions (id, organization_id, plan_key, plan_version, status,
        current_period_start, current_period_end, updated_at)
      VALUES (${subscriptionId}::uuid, ${orgId}::uuid, 'free', 1, 'ACTIVE',
        '2099-01-01', '2099-02-01', now())`
    await tx.$executeRaw`
      INSERT INTO billing_periods (id, organization_id, subscription_id, plan_key, plan_version,
        currency, period_start, period_end, fixed_price, overage_total, amount_due, status,
        closed_at, updated_at)
      VALUES (${billingPeriodId}::uuid, ${orgId}::uuid, ${subscriptionId}::uuid, 'free', 1, 'EUR',
        '2098-12-01', '2099-01-01', 0, 0, 0, 'NO_CHARGE', now(), now())`
    await tx.$executeRaw`
      INSERT INTO subscription_periods (id, organization_id, subscription_id, period_start,
        period_end, plan_key, plan_version, updated_at)
      VALUES (${newId()}::uuid, ${orgId}::uuid, ${subscriptionId}::uuid, '2099-01-01',
        '2099-02-01', 'free', 1, now())`
  })
})
afterAll(() => db.$disconnect())

const violation = (run: (tx: TenantTx) => Promise<unknown>) =>
  withTenant(db, orgId, run).then(
    () => 'accepted',
    (e: unknown) =>
      JSON.stringify(e, Object.getOwnPropertyNames(e)).includes('23514') ? 'check' : String(e),
  )

describe('billing CHECK constraints (R3.1)', () => {
  it('usage quantity must be positive', async () => {
    for (const q of ['0', '-1']) {
      expect(
        await violation(
          (tx) => tx.$executeRaw`
            INSERT INTO usage_events (id, organization_id, metric, quantity, occurred_at,
              idempotency_key) VALUES (${newId()}::uuid, ${orgId}::uuid, 'm', ${q}::numeric,
              now(), ${newId()})`,
        ),
      ).toBe('check')
    }
  })

  /** Inserts a closed billing period with one column overridden (the table is append-only). */
  const billingPeriod = (overrides: Record<string, string>) => (tx: TenantTx) => {
    const v = {
      period_start: "'2098-11-01'",
      period_end: "'2098-12-01'",
      fixed_price: '0',
      overage_total: '0',
      amount_due: '0',
      spend_cap: 'NULL',
      ...overrides,
    }
    return tx.$executeRawUnsafe(
      `INSERT INTO billing_periods (id, organization_id, subscription_id, plan_key, plan_version,
         currency, period_start, period_end, fixed_price, overage_total, spend_cap, amount_due,
         status, closed_at, updated_at)
       VALUES ('${newId()}', '${orgId}', '${subscriptionId}', 'free', 1, 'EUR', ${v.period_start},
         ${v.period_end}, ${v.fixed_price}, ${v.overage_total}, ${v.spend_cap}, ${v.amount_due},
         'NO_CHARGE', now(), now())`,
    )
  }

  it('periods must end after they start', async () => {
    expect(
      await violation(
        (tx) => tx.$executeRaw`UPDATE subscriptions SET current_period_end = current_period_start`,
      ),
    ).toBe('check')
    expect(
      await violation(
        (tx) => tx.$executeRaw`UPDATE subscription_periods SET period_end = period_start`,
      ),
    ).toBe('check')
    expect(
      await violation(billingPeriod({ period_start: "'2098-11-01'", period_end: "'2098-11-01'" })),
    ).toBe('check')
    expect(
      await violation(billingPeriod({ period_start: "'2098-11-02'", period_end: "'2098-11-01'" })),
    ).toBe('check')
  })

  it('amounts and spend caps cannot be negative', async () => {
    for (const column of ['fixed_price', 'overage_total', 'amount_due', 'spend_cap']) {
      expect(await violation(billingPeriod({ [column]: '-0.01' }))).toBe('check')
    }
    expect(await violation((tx) => tx.$executeRaw`UPDATE subscriptions SET spend_cap = -1`)).toBe(
      'check',
    )
    // A valid one goes through (also proves the helper is not what fails above).
    expect(await violation(billingPeriod({ spend_cap: '10' }))).toBe('accepted')
  })

  it('period lines cannot hold negative quantities or amounts', async () => {
    const line = (column: string, value: string) => (tx: TenantTx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO billing_period_lines (id, organization_id, period_id, metric, unit, used,
           included, overage_units, unit_price, amount)
         VALUES ('${newId()}', '${orgId}', '${billingPeriodId}', 'm-${column}', 'u',
           ${column === 'used' ? value : '1'}, ${column === 'included' ? value : '1'},
           ${column === 'overage_units' ? value : '0'}, ${column === 'unit_price' ? value : '0'},
           ${column === 'amount' ? value : '0'})`,
      )
    for (const column of ['used', 'included', 'overage_units', 'unit_price', 'amount']) {
      expect(await violation(line(column, '-1'))).toBe('check')
    }
    expect(await violation(line('used', '5'))).toBe('accepted')
  })

  it('valid values are accepted (zero amounts, no cap, unlimited included)', async () => {
    expect(
      await violation(
        (tx) => tx.$executeRaw`
          INSERT INTO billing_period_lines (id, organization_id, period_id, metric, unit, used,
            included, overage_units, unit_price, amount)
          VALUES (${newId()}::uuid, ${orgId}::uuid, ${billingPeriodId}::uuid, 'ok', 'u', 0, NULL,
            0, 0, 0)`,
      ),
    ).toBe('accepted')
    expect(await violation((tx) => tx.$executeRaw`UPDATE subscriptions SET spend_cap = NULL`)).toBe(
      'accepted',
    )
  })
})
