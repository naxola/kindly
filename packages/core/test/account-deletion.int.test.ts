import { createDb, newId, withTenant, type Db } from '@saas/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RecordingQueue } from './fake-queue.ts'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  accountDeletionState,
  cancelAccountDeletion,
  createOrganization,
  DomainError,
  ensureUser,
  exportPersonalData,
  listMyOrganizations,
  previewAccountDeletion,
  processAccountDeletions,
  requestAccountDeletion,
  updateOrganization,
  type BaseCtx,
} from '../src/index.ts'

let db: Db
const queue = new RecordingQueue()
let clock = new Date()
const base = (): BaseCtx => ({
  db,
  queue,
  correlationId: newId(),
  appUrl: 'https://app.example.com',
  now: () => clock,
})
const DAY = 24 * 60 * 60 * 1000

beforeAll(() => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
})
afterAll(async () => {
  await db.$disconnect()
})

async function person(name = 'Person') {
  const access = await db.authUser.create({
    data: { id: newId(), email: `p-${newId()}@example.com`, name, emailVerified: true },
  })
  await db.authSession.create({
    data: {
      id: newId(),
      userId: access.id,
      token: newId(),
      expiresAt: new Date(Date.now() + DAY),
    },
  })
  const user = await ensureUser(base(), access.id)
  return { access, user }
}

const orgOf = async (userId: string, name = 'Acme') =>
  (await createOrganization(base(), userId, { name, slug: `org-${newId().slice(-12)}` }))
    .organization

/** Adds an active member to an organization (fixtures may write tenant rows directly). */
async function addMember(organizationId: string, userId: string, role: 'ADMIN' | 'MEMBER') {
  return withTenant(db, organizationId, (tx) =>
    tx.organizationMember.create({ data: { organizationId, userId, role, status: 'ACTIVE' } }),
  )
}

const codesOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code, details: e.details?.map((d) => d.code) }
    throw e
  }
  throw new Error('expected a DomainError')
}

describe('account deletion (ADR 0019)', () => {
  it('requests the deletion with the 14-day grace period and a confirmation email', async () => {
    clock = new Date()
    const { user, access } = await person()
    const org = await orgOf(user.id)
    const result = await requestAccountDeletion(base(), user.id)
    expect(result.scheduledFor.getTime()).toBe(clock.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY)
    expect(result.archive.map((o) => o.id)).toEqual([org.id])
    expect(await accountDeletionState(db, user.id)).toMatchObject({
      scheduledFor: result.scheduledFor,
    })
    const mail = queue.of('identity.account-deletion-email').find((j) => {
      const p = j.payload as { to: string; kind: string }
      return p.to === access.email && p.kind === 'REQUESTED'
    })
    expect(mail).toBeDefined()
    // A second request keeps the first date.
    clock = new Date(clock.getTime() + DAY)
    const again = await requestAccountDeletion(base(), user.id)
    expect(again.scheduledFor).toEqual(result.scheduledFor)
  })

  it('blocks the request for the last ADMIN of an organization with other members', async () => {
    const { user } = await person()
    const other = await person()
    const org = await orgOf(user.id, 'Shared')
    await addMember(org.id, other.user.id, 'MEMBER')
    const blocked = await codesOf(requestAccountDeletion(base(), user.id))
    expect(blocked).toEqual({ code: 'CONFLICT', details: ['LAST_ADMIN'] })
    expect(await accountDeletionState(db, user.id)).toBeNull()
    expect((await previewAccountDeletion(db, user.id)).blockers).toHaveLength(1)
    // Naming another ADMIN unblocks it, and the organization is not archived.
    await withTenant(db, org.id, (tx) =>
      tx.organizationMember.updateMany({
        where: { userId: other.user.id },
        data: { role: 'ADMIN' },
      }),
    )
    const ok = await requestAccountDeletion(base(), user.id)
    expect(ok.archive).toEqual([])
  })

  it('blocks a sole-member organization with a live paid subscription', async () => {
    const { user } = await person()
    const org = await orgOf(user.id, 'Paid')
    await withTenant(db, org.id, (tx) =>
      tx.subscription.upsert({
        where: { organizationId: org.id },
        create: {
          organizationId: org.id,
          planKey: 'pro',
          planVersion: 1,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * DAY),
          provider: 'paddle',
          providerSubscriptionId: `sub_${newId()}`,
        },
        update: { provider: 'paddle', status: 'ACTIVE', providerSubscriptionId: `sub_${newId()}` },
      }),
    )
    expect(await codesOf(requestAccountDeletion(base(), user.id))).toEqual({
      code: 'CONFLICT',
      details: ['ORGANIZATION_HAS_SUBSCRIPTION'],
    })
  })

  it('cancels the request and tells the person', async () => {
    const { user } = await person()
    await requestAccountDeletion(base(), user.id)
    await cancelAccountDeletion(base(), user.id)
    expect(await accountDeletionState(db, user.id)).toBeNull()
    expect(
      queue
        .of('identity.account-deletion-email')
        .some((j) => (j.payload as { kind: string }).kind === 'CANCELLED'),
    ).toBe(true)
    // Cancelling again is harmless.
    await cancelAccountDeletion(base(), user.id)
  })

  it('does not touch a request whose period has not ended', async () => {
    clock = new Date()
    const { user, access } = await person()
    await requestAccountDeletion(base(), user.id)
    clock = new Date(clock.getTime() + (ACCOUNT_DELETION_GRACE_DAYS - 1) * DAY)
    await processAccountDeletions(base())
    expect((await db.user.findUnique({ where: { id: user.id } }))?.anonymizedAt).toBeNull()
    expect(await db.authUser.findUnique({ where: { id: access.id } })).not.toBeNull()
  })

  it('executes it when due: access gone, anonymized, memberships off, solo organization archived', async () => {
    clock = new Date()
    const { user, access } = await person('Real Name')
    const solo = await orgOf(user.id, 'Solo')
    const other = await person()
    const shared = await orgOf(other.user.id, 'Shared')
    await addMember(shared.id, user.id, 'MEMBER')
    await requestAccountDeletion(base(), user.id)
    clock = new Date(clock.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY + 1000)

    const result = await processAccountDeletions(base())
    expect(result.deleted).toBeGreaterThanOrEqual(1)

    expect(await db.authUser.findUnique({ where: { id: access.id } })).toBeNull()
    expect(await db.authSession.count({ where: { userId: access.id } })).toBe(0)
    const after = await db.user.findUnique({ where: { id: user.id } })
    expect(after).toMatchObject({
      authUserId: null,
      displayName: 'Deleted user',
      locale: null,
      deletionScheduledFor: null,
    })
    expect(after?.anonymizedAt).not.toBeNull()

    const soloRow = await withTenant(db, solo.id, (tx) =>
      tx.organization.findUnique({ where: { id: solo.id } }),
    )
    expect(soloRow?.archivedAt).not.toBeNull()
    const sharedRow = await withTenant(db, shared.id, (tx) =>
      tx.organization.findUnique({ where: { id: shared.id } }),
    )
    expect(sharedRow?.archivedAt).toBeNull()
    const membership = await withTenant(db, shared.id, (tx) =>
      tx.organizationMember.findFirst({ where: { userId: user.id } }),
    )
    expect(membership?.status).toBe('DISABLED')
    expect(await listMyOrganizations(db, user.id)).toEqual([])

    // Audit keeps the actor id; the event carries the id and never the address.
    const audit = await withTenant(db, solo.id, (tx) =>
      tx.auditLog.findMany({ where: { actorId: user.id, action: 'organization.archived' } }),
    )
    expect(audit).toHaveLength(1)
    const event = queue.of('events.deliver').find((j) => {
      const p = j.payload as { type?: string; data?: { userId?: string } }
      return p.type === 'user.deleted' && p.data?.userId === user.id
    })
    expect(event).toBeDefined()
    expect(JSON.stringify(event?.payload)).not.toContain(access.email)
    const done = queue
      .of('identity.account-deletion-email')
      .find(
        (j) =>
          (j.payload as { kind: string; to: string }).kind === 'COMPLETED' &&
          (j.payload as { to: string }).to === access.email,
      )
    expect(done).toBeDefined()

    // Re-running is idempotent.
    const again = await processAccountDeletions(base())
    expect(again.deleted).toBe(0)
  })

  it('cancels the request when a rule started to block it during the grace period', async () => {
    clock = new Date()
    const { user, access } = await person()
    const other = await person()
    const org = await orgOf(other.user.id, 'Later')
    await addMember(org.id, user.id, 'ADMIN') // two admins: allowed
    await requestAccountDeletion(base(), user.id)
    // The other admin leaves: the person is now the last ADMIN of a non-solo organization.
    await addMember(org.id, (await person()).user.id, 'MEMBER')
    await withTenant(db, org.id, (tx) =>
      tx.organizationMember.updateMany({
        where: { userId: other.user.id },
        data: { status: 'DISABLED' },
      }),
    )
    clock = new Date(clock.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY + 1000)
    const result = await processAccountDeletions(base())
    expect(result.blocked).toBeGreaterThanOrEqual(1)
    expect(await db.authUser.findUnique({ where: { id: access.id } })).not.toBeNull()
    expect(await accountDeletionState(db, user.id)).toBeNull()
    expect(
      queue
        .of('identity.account-deletion-email')
        .some(
          (j) =>
            (j.payload as { kind: string; to: string }).kind === 'BLOCKED' &&
            (j.payload as { to: string }).to === access.email,
        ),
    ).toBe(true)
  })

  it('exports the profile, memberships and the audit entries the person authored', async () => {
    clock = new Date()
    const { user, access } = await person('Exporter')
    const org = await orgOf(user.id, 'Exported')
    const { resolveActor } = await import('../src/index.ts')
    const { actor } = await resolveActor(db, { userId: user.id, organizationId: org.id })
    await updateOrganization({ ...base(), actor }, { name: 'Exported 2' })
    const data = await exportPersonalData(base(), user.id)
    expect(data.profile).toMatchObject({ id: user.id, displayName: 'Exporter' })
    expect(data.access).toMatchObject({ email: access.email })
    expect(data.organizations.map((o) => o.id)).toEqual([org.id])
    expect(data.organizations[0]).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' })
    expect(data.activity.some((a) => a.action === 'organization.updated')).toBe(true)
    expect(data.activityTruncated).toBe(false)
    expect(JSON.stringify(data)).not.toMatch(/password|token/i)
  })
})
