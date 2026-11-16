import { createDb, newId, withTenant, type Db } from '@saas/database'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RecordingQueue } from './fake-queue.ts'
import {
  acceptInvitation,
  createInvitation,
  createOrganization,
  DomainError,
  ensureUser,
  listActivity,
  purgeExpiredAuditLogs,
  resolveActor,
  updateOrganization,
  type Ctx,
} from '../src/index.ts'

let db: Db
let platform: pg.Client
const queue = new RecordingQueue()
const base = () => ({ db, queue, correlationId: newId(), appUrl: 'https://app.example.com' })

beforeAll(async () => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  // Reads what RLS hides from app_user (rows of any age and without organization).
  platform = new pg.Client({
    connectionString: process.env.TEST_DATABASE_URL!.replace(
      /\/\/[^@]+@/,
      `//app_platform:${process.env.APP_PLATFORM_PASSWORD ?? 'platform'}@`,
    ),
  })
  await platform.connect()
})
afterAll(async () => {
  await platform.end()
  await db.$disconnect()
})

async function organization(name = 'Acme') {
  const access = await db.authUser.create({
    data: {
      id: newId(),
      email: `a-${newId()}@example.com`,
      name: 'Ada Admin',
      emailVerified: true,
    },
  })
  const user = await ensureUser(base(), access.id)
  const { organization } = await createOrganization(base(), user.id, {
    name,
    slug: `act-${newId().slice(-12)}`,
  })
  const { actor } = await resolveActor(db, { userId: user.id, organizationId: organization.id })
  return { user, organization, ctx: { ...base(), actor } as Ctx }
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return e.code
    throw e
  }
  throw new Error('expected a DomainError')
}

describe('activity of the organization (R3.5, ADR 0018)', () => {
  it('lists the audit log newest first, with who did it, and without IP or snapshots', async () => {
    const { ctx, user } = await organization()
    await updateOrganization({ ...ctx, ip: '203.0.113.9' }, { name: 'Acme Dos' })
    const { items, nextCursor } = await listActivity(ctx)
    expect(items.map((i) => i.action)).toEqual(['organization.updated', 'organization.created'])
    expect(items[0]).toMatchObject({
      resourceType: 'organization',
      actor: { userId: user.id, displayName: 'Ada Admin' },
    })
    expect(nextCursor).toBeNull()
    const exposed = JSON.stringify(items)
    expect(exposed).not.toContain('203.0.113.9')
    expect(exposed).not.toContain('Acme Dos')
    expect(Object.keys(items[0]!)).not.toEqual(expect.arrayContaining(['ip', 'before', 'after']))
  })

  it('pages with a cursor without repeating or skipping entries', async () => {
    const { ctx } = await organization()
    for (let i = 0; i < 6; i++) await updateOrganization(ctx, { name: `Nombre ${i}` })
    const seen: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const page = await listActivity(ctx, { limit: 3, ...(cursor ? { cursor } : {}) })
      seen.push(...page.items.map((i) => i.id))
      cursor = page.nextCursor ?? undefined
      pages++
    } while (cursor)
    expect(seen).toHaveLength(7) // 6 updates + the creation
    expect(new Set(seen).size).toBe(7)
    expect(pages).toBe(3)
    expect(await codeOf(listActivity(ctx, { cursor: 'not-a-cursor' }))).toBe('VALIDATION_FAILED')
  })

  it('filters by action (exact or prefix), actor and dates', async () => {
    const { ctx, user } = await organization()
    await createInvitation(ctx, { email: `g-${newId()}@example.com` })
    await updateOrganization(ctx, { name: 'Otra' })
    const actions = async (filter: Parameters<typeof listActivity>[1]) =>
      (await listActivity(ctx, filter)).items.map((i) => i.action)
    expect(await actions({ action: 'invitation.created' })).toEqual(['invitation.created'])
    expect((await actions({ action: 'organization.' })).sort()).toEqual([
      'organization.created',
      'organization.updated',
    ])
    expect(await actions({ actorUserId: user.id })).toHaveLength(3)
    expect(await actions({ actorUserId: newId() })).toEqual([])
    expect(await actions({ to: new Date(Date.now() - 3_600_000) })).toEqual([])
    expect(await actions({ from: new Date(Date.now() - 3_600_000) })).toHaveLength(3)
  })

  it('only an ADMIN reads it, and never another organization', async () => {
    const mine = await organization('Mía')
    const other = await organization('Ajena')
    const guestAccess = await db.authUser.create({
      data: { id: newId(), email: `m-${newId()}@example.com`, name: 'Mem', emailVerified: true },
    })
    const { token } = await createInvitation(mine.ctx, { email: guestAccess.email })
    const guest = await ensureUser(base(), guestAccess.id)
    await acceptInvitation(base(), { token, userId: guest.id })
    const { actor } = await resolveActor(db, {
      userId: guest.id,
      organizationId: mine.organization.id,
    })
    expect(await codeOf(listActivity({ ...base(), actor }))).toBe('FORBIDDEN')
    const ids = new Set((await listActivity(other.ctx)).items.map((i) => i.resourceId))
    expect(ids.has(mine.organization.id)).toBe(false)
  })
})

describe('retention of the audit log (ADR 0018)', () => {
  const insertAged = (organizationId: string, months: number, action: string) =>
    withTenant(db, organizationId, (tx) =>
      tx.auditLog.createMany({
        data: [
          {
            organizationId,
            actorType: 'SYSTEM',
            action,
            resourceType: 'test',
            createdAt: new Date(Date.now() - months * 30.5 * 86_400_000),
          },
        ],
      }),
    )
  const count = async (organizationId: string, action: string) =>
    (
      await platform.query(
        'SELECT count(*)::int AS n FROM audit_logs WHERE organization_id = $1 AND action = $2',
        [organizationId, action],
      )
    ).rows[0].n as number

  it('deletes what is older than 24 months and nothing newer, and audits the purge', async () => {
    const { organization: org } = await organization()
    await insertAged(org.id, 30, 'test.old')
    await insertAged(org.id, 25, 'test.old')
    await insertAged(org.id, 23, 'test.recent')
    const deleted = await purgeExpiredAuditLogs(db)
    expect(deleted).toBeGreaterThanOrEqual(2)
    expect(await count(org.id, 'test.old')).toBe(0)
    expect(await count(org.id, 'test.recent')).toBe(1)
    expect(await count(org.id, 'organization.created')).toBe(1)
    const purges = await platform.query(
      `SELECT after FROM audit_logs WHERE action = 'audit.purged' ORDER BY created_at DESC LIMIT 1`,
    )
    expect(purges.rows[0].after.deleted).toBe(deleted)
    // Nothing left to purge: no second audit entry, zero deleted.
    expect(await purgeExpiredAuditLogs(db)).toBe(0)
  })

  it('the application still cannot delete or change audit entries itself', async () => {
    const { organization: org } = await organization()
    await insertAged(org.id, 30, 'test.locked')
    await expect(
      withTenant(db, org.id, (tx) => tx.auditLog.deleteMany({ where: { organizationId: org.id } })),
    ).rejects.toThrow(/permission denied/)
    await expect(
      withTenant(db, org.id, (tx) =>
        tx.auditLog.updateMany({ where: { organizationId: org.id }, data: { action: 'x' } }),
      ),
    ).rejects.toThrow(/permission denied/)
  })
})
