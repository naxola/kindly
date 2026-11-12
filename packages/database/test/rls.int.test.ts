import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, InvalidTenantError, newId, withTenant, type Db } from '../src/index.ts'

/**
 * Global tables without tenant RLS. Adding one requires justifying it in an ADR:
 * every new table is protected by default.
 */
const GLOBAL_TABLES = new Set<string>([
  '_prisma_migrations',
  // Access (ADR 0003): managed by Better Auth, they belong to no tenant.
  'auth_users',
  'auth_sessions',
  'auth_accounts',
  'auth_verifications',
  // Business person, shared by all the organizations they belong to (ADR 0003).
  'users',
])

let db: Db
// Single-connection pool: proves the context does not leak between transactions.
let singleConnDb: Db
let migrator: pg.Client

async function createOrg(name: string) {
  const id = newId()
  await withTenant(db, id, (tx) =>
    tx.organization.create({ data: { id, name, slug: `${name}-${id}` } }),
  )
  return id
}

beforeAll(async () => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  singleConnDb = createDb({ connectionString: process.env.DATABASE_URL!, max: 1 })
  migrator = new pg.Client({ connectionString: process.env.DATABASE_MIGRATOR_URL })
  await migrator.connect()
})

afterAll(async () => {
  await db.$disconnect()
  await singleConnDb.$disconnect()
  await migrator.end()
})

describe('schema', () => {
  it('every table in public has RLS enabled and forced, except the declared global ones', async () => {
    const { rows } = await migrator.query<{ table: string; rls: boolean; forced: boolean }>(`
      SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`)
    const unprotected = rows
      .filter((r) => !GLOBAL_TABLES.has(r.table))
      .filter((r) => !r.rls || !r.forced)
      .map((r) => r.table)
    expect(rows.length).toBeGreaterThan(1)
    expect(unprotected).toEqual([])
  })

  it('app_user has no BYPASSRLS and owns no table', async () => {
    const { rows: roles } = await migrator.query<{ rolbypassrls: boolean }>(
      `SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'`,
    )
    expect(roles[0]?.rolbypassrls).toBe(false)
    const { rows: owned } = await migrator.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'app_user'`,
    )
    expect(owned).toEqual([])
  })
})

describe('tenant isolation', () => {
  let orgA: string
  let orgB: string

  beforeAll(async () => {
    orgA = await createOrg('org-a')
    orgB = await createOrg('org-b')
  })

  it('without tenant context no organization is visible', async () => {
    expect(await db.organization.findMany()).toEqual([])
  })

  it("with A's context only A is visible, even when B is requested by id", async () => {
    const visible = await withTenant(db, orgA, (tx) => tx.organization.findMany())
    expect(visible.map((o) => o.id)).toEqual([orgA])
    const other = await withTenant(db, orgA, (tx) =>
      tx.organization.findUnique({ where: { id: orgB } }),
    )
    expect(other).toBeNull()
  })

  it("with A's context B cannot be modified", async () => {
    const result = await withTenant(db, orgA, (tx) =>
      tx.organization.updateMany({ where: { id: orgB }, data: { name: 'hacked' } }),
    )
    expect(result.count).toBe(0)
    const b = await withTenant(db, orgB, (tx) =>
      tx.organization.findUnique({ where: { id: orgB } }),
    )
    expect(b?.name).toBe('org-b')
  })

  it("with A's context nothing can be inserted on behalf of B", async () => {
    await expect(
      withTenant(db, orgA, (tx) =>
        tx.auditLog.create({
          data: { organizationId: orgB, actorType: 'SYSTEM', action: 'x', resourceType: 'test' },
        }),
      ),
    ).rejects.toThrow()
  })

  it('the context does not persist outside the transaction (same pooled connection)', async () => {
    const inside = await withTenant(singleConnDb, orgA, (tx) => tx.organization.count())
    expect(inside).toBe(1)
    expect(await singleConnDb.organization.count()).toBe(0)
  })

  it('rejects an organizationId that is not a UUID', async () => {
    await expect(withTenant(db, "x' OR 1=1 --", () => Promise.resolve(1))).rejects.toBeInstanceOf(
      InvalidTenantError,
    )
  })
})

describe('audit log', () => {
  it('is append-only for app_user', async () => {
    const org = await createOrg('org-audit')
    const entry = await withTenant(db, org, (tx) =>
      tx.auditLog.create({
        data: { organizationId: org, actorType: 'SYSTEM', action: 'test', resourceType: 'test' },
      }),
    )
    await expect(
      withTenant(db, org, (tx) =>
        tx.auditLog.update({ where: { id: entry.id }, data: { action: 'tampered' } }),
      ),
    ).rejects.toThrow(/permission denied/i)
    await expect(
      withTenant(db, org, (tx) => tx.auditLog.delete({ where: { id: entry.id } })),
    ).rejects.toThrow(/permission denied/i)
  })
})
