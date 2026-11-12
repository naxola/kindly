import { createDb, newId, withTenant, withUser, type Db } from '@saas/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RecordingQueue } from './fake-queue.ts'
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  createOrganization,
  disableMember,
  DomainError,
  enableMember,
  ensureUser,
  getInvitationByToken,
  listMembers,
  listMyOrganizations,
  resolveActor,
  revokeInvitation,
  type Ctx,
} from '../src/index.ts'

let db: Db
const queue = new RecordingQueue()
const base = () => ({ db, queue, correlationId: newId(), appUrl: 'https://app.example.com' })

beforeAll(() => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
})
afterAll(async () => {
  await db.$disconnect()
})

/** Access account as Better Auth would create it (tests may touch auth_* for fixtures). */
async function accessAccount(email = `p-${newId()}@example.com`, name = 'Person') {
  return db.authUser.create({ data: { id: newId(), email, name, emailVerified: true } })
}

async function personWithOrg(slug = `org-${newId().slice(-12)}`) {
  const access = await accessAccount()
  const user = await ensureUser(base(), access.id)
  const { organization } = await createOrganization(base(), user.id, { name: 'Acme', slug })
  const { actor } = await resolveActor(db, { userId: user.id, organizationId: organization.id })
  const ctx: Ctx = { ...base(), actor }
  return { access, user, organization, ctx }
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code, detail: e.details?.[0]?.code }
    throw e
  }
  throw new Error('expected a DomainError')
}

describe('business user', () => {
  it('is created on first entry, once, linked to the access account', async () => {
    const access = await accessAccount(undefined, 'Ana López')
    expect(await db.user.findUnique({ where: { authUserId: access.id } })).toBeNull()
    const [a, b] = await Promise.all([ensureUser(base(), access.id), ensureUser(base(), access.id)])
    expect(a.id).toBe(b.id)
    expect(a.displayName).toBe('Ana López')
    expect(await db.user.count({ where: { authUserId: access.id } })).toBe(1)
  })

  it('survives the deletion of its access account, anonymized link (GDPR)', async () => {
    const { access, user, organization } = await personWithOrg()
    await db.authUser.delete({ where: { id: access.id } })
    const after = await db.user.findUnique({ where: { id: user.id } })
    expect(after?.authUserId).toBeNull()
    const members = await withTenant(db, organization.id, (tx) =>
      tx.organizationMember.count({ where: { userId: user.id } }),
    )
    expect(members).toBe(1)
  })
})

describe('organizations and actor', () => {
  it('the creator becomes ADMIN and the creation is audited', async () => {
    const { ctx, organization } = await personWithOrg()
    expect(ctx.actor.role).toBe('ADMIN')
    const audit = await withTenant(db, organization.id, (tx) =>
      tx.auditLog.findMany({ where: { action: 'organization.created' } }),
    )
    expect(audit).toHaveLength(1)
    expect(audit[0]?.actorId).toBe(ctx.actor.userId)
  })

  it('rejects a duplicated slug with CONFLICT', async () => {
    const { organization } = await personWithOrg()
    const other = await ensureUser(base(), (await accessAccount()).id)
    expect(
      await codeOf(createOrganization(base(), other.id, { name: 'Copy', slug: organization.slug })),
    ).toEqual({ code: 'CONFLICT', detail: 'TAKEN' })
  })

  it('a non-member gets NOT_FOUND, without learning whether the organization exists', async () => {
    const { organization } = await personWithOrg()
    const stranger = await ensureUser(base(), (await accessAccount()).id)
    expect(
      await codeOf(resolveActor(db, { userId: stranger.id, organizationId: organization.id })),
    ).toEqual({ code: 'NOT_FOUND', detail: undefined })
  })

  it('a user only sees their own organizations and memberships (RLS with app.user_id)', async () => {
    const a = await personWithOrg()
    const b = await personWithOrg()
    const mine = await listMyOrganizations(db, a.user.id)
    expect(mine.map((o) => o.id)).toEqual([a.organization.id])
    const visible = await withUser(db, a.user.id, (tx) => tx.organizationMember.findMany())
    expect(visible.every((m) => m.userId === a.user.id)).toBe(true)
    const foreign = await withUser(db, a.user.id, (tx) =>
      tx.organization.findUnique({ where: { id: b.organization.id } }),
    )
    expect(foreign).toBeNull()
  })

  it('the user context cannot write tenant data', async () => {
    const { user, organization } = await personWithOrg()
    await expect(
      withUser(db, user.id, (tx) =>
        tx.organizationMember.create({
          data: { organizationId: organization.id, userId: user.id, role: 'ADMIN' },
        }),
      ),
    ).rejects.toThrow()
  })
})

describe('invitations', () => {
  async function invited(role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
    const owner = await personWithOrg()
    const guestAccess = await accessAccount()
    const { invitation, token } = await createInvitation(owner.ctx, {
      email: guestAccess.email.toUpperCase(),
      role,
    })
    const guest = await ensureUser(base(), guestAccess.id)
    return { owner, guest, guestAccess, invitation, token }
  }

  it('stores only the token hash and shows a public view by token', async () => {
    const { invitation, token, owner } = await invited()
    expect(invitation.tokenHash).not.toContain(token)
    expect(invitation.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    const view = await getInvitationByToken(base(), token)
    expect(view).toMatchObject({ status: 'PENDING', organizationName: 'Acme', role: 'MEMBER' })
    expect(view?.organizationId).toBe(owner.organization.id)
    expect(await getInvitationByToken(base(), 'not-a-real-token')).toBeNull()
  })

  it('accepting with the invited email (any case) creates the member', async () => {
    const { owner, guest, token } = await invited()
    const member = await acceptInvitation(base(), { token, userId: guest.id })
    expect(member.role).toBe('MEMBER')
    const members = await listMembers(owner.ctx)
    expect(members.map((m) => m.userId).sort()).toEqual([owner.user.id, guest.id].sort())
    expect((await getInvitationByToken(base(), token))?.status).toBe('ACCEPTED')
    expect(await codeOf(acceptInvitation(base(), { token, userId: guest.id }))).toEqual({
      code: 'CONFLICT',
      detail: 'INVITATION_ACCEPTED',
    })
  })

  it('a forwarded link is useless for another email', async () => {
    const { token } = await invited()
    const other = await ensureUser(base(), (await accessAccount()).id)
    expect(await codeOf(acceptInvitation(base(), { token, userId: other.id }))).toEqual({
      code: 'FORBIDDEN',
      detail: 'EMAIL_MISMATCH',
    })
  })

  it('revoked and expired invitations cannot be accepted', async () => {
    const r = await invited()
    await revokeInvitation(r.owner.ctx, r.invitation.id)
    expect(await codeOf(acceptInvitation(base(), { token: r.token, userId: r.guest.id }))).toEqual({
      code: 'CONFLICT',
      detail: 'INVITATION_REVOKED',
    })
    const e = await invited()
    const later = { ...base(), now: () => new Date(Date.now() + 8 * 24 * 3600 * 1000) }
    expect(await codeOf(acceptInvitation(later, { token: e.token, userId: e.guest.id }))).toEqual({
      code: 'CONFLICT',
      detail: 'INVITATION_EXPIRED',
    })
  })

  it('a second pending invitation for the same email is a CONFLICT', async () => {
    const { owner, guestAccess } = await invited()
    expect(await codeOf(createInvitation(owner.ctx, { email: guestAccess.email }))).toEqual({
      code: 'CONFLICT',
      detail: 'PENDING_INVITATION',
    })
  })

  it('a MEMBER cannot invite (FORBIDDEN)', async () => {
    const { owner, guest, token } = await invited('MEMBER')
    await acceptInvitation(base(), { token, userId: guest.id })
    const { actor } = await resolveActor(db, {
      userId: guest.id,
      organizationId: owner.organization.id,
    })
    expect(
      await codeOf(createInvitation({ ...base(), actor }, { email: 'x@example.com' })),
    ).toEqual({
      code: 'FORBIDDEN',
      detail: 'MISSING_PERMISSION',
    })
  })
})

describe('members', () => {
  it('the organization always keeps an active ADMIN', async () => {
    const { ctx } = await personWithOrg()
    expect(await codeOf(changeMemberRole(ctx, ctx.actor.memberId, { role: 'MEMBER' }))).toEqual({
      code: 'CONFLICT',
      detail: 'LAST_ADMIN',
    })
    expect(await codeOf(disableMember(ctx, ctx.actor.memberId))).toEqual({
      code: 'CONFLICT',
      detail: 'LAST_ADMIN',
    })
  })

  it('a disabled member can no longer act in the organization', async () => {
    const owner = await personWithOrg()
    const guestAccess = await accessAccount()
    const { token } = await createInvitation(owner.ctx, { email: guestAccess.email })
    const guest = await ensureUser(base(), guestAccess.id)
    const member = await acceptInvitation(base(), { token, userId: guest.id })
    await disableMember(owner.ctx, member.id)
    expect(
      await codeOf(resolveActor(db, { userId: guest.id, organizationId: owner.organization.id })),
    ).toEqual({ code: 'NOT_FOUND', detail: undefined })
  })
})

describe('emails and business events (enqueued in the same transaction)', () => {
  it('first entry emits user.created once, with the access email', async () => {
    const access = await accessAccount()
    await ensureUser(base(), access.id)
    await ensureUser(base(), access.id)
    const events = queue
      .of('events.deliver')
      .filter((j) => (j.payload as { data: { email?: string } }).data.email === access.email)
    expect(events).toHaveLength(1)
    expect(events[0]?.payload).toMatchObject({ type: 'user.created', organizationId: null })
  })

  it('creating an organization emits organization.created with its owner', async () => {
    const { organization, access } = await personWithOrg()
    const event = queue
      .of('events.deliver')
      .find((j) => j.options.idempotencyKey === `organization.created:${organization.id}`)
    expect(event?.payload).toMatchObject({
      type: 'organization.created',
      organizationId: organization.id,
      data: { name: 'Acme', ownerEmail: access.email },
    })
  })

  it('an invitation enqueues its email with the link and the invitation.created event', async () => {
    const owner = await personWithOrg()
    const { invitation, token } = await createInvitation(owner.ctx, {
      email: 'guest@example.com',
    })
    const [email] = queue
      .of('identity.invitation-email')
      .filter((j) => j.options.idempotencyKey === `invitation:${invitation.id}`)
    expect(email?.payload).toMatchObject({
      to: 'guest@example.com',
      organizationName: 'Acme',
      inviterName: 'Person',
      url: `https://app.example.com/invite#${token}`,
      expiresInDays: 7,
    })
    expect(email?.options.organizationId).toBe(owner.organization.id)
    const event = queue
      .of('events.deliver')
      .find((j) => j.options.idempotencyKey === `invitation.created:${invitation.id}`)
    // The event carries no email and no token: data minimization.
    expect(JSON.stringify(event?.payload)).not.toContain('guest@example.com')
    expect(JSON.stringify(event?.payload)).not.toContain(token)
  })

  it('accepting an invitation emits member.joined', async () => {
    const owner = await personWithOrg()
    const guestAccess = await accessAccount()
    const { token } = await createInvitation(owner.ctx, { email: guestAccess.email })
    const guest = await ensureUser(base(), guestAccess.id)
    const member = await acceptInvitation(base(), { token, userId: guest.id })
    const event = queue
      .of('events.deliver')
      .find((j) => j.options.idempotencyKey === `member.joined:${member.id}`)
    expect(event?.payload).toMatchObject({ type: 'member.joined', data: { userId: guest.id } })
  })
})

describe('member listing and re-enabling', () => {
  it('lists members with their access email, and a disabled member can be re-enabled', async () => {
    const owner = await personWithOrg()
    const guestAccess = await accessAccount()
    const { token } = await createInvitation(owner.ctx, { email: guestAccess.email })
    const guest = await ensureUser(base(), guestAccess.id)
    const member = await acceptInvitation(base(), { token, userId: guest.id })
    const listed = await listMembers(owner.ctx)
    expect(listed.find((m) => m.id === member.id)?.email).toBe(guestAccess.email)
    await disableMember(owner.ctx, member.id)
    await enableMember(owner.ctx, member.id)
    const { actor } = await resolveActor(db, {
      userId: guest.id,
      organizationId: owner.organization.id,
    })
    expect(actor.memberId).toBe(member.id)
  })
})
