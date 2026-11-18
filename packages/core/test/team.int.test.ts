import { createDb, newId, withTenant, type Db } from '@saas/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import { RecordingQueue } from './fake-queue.ts'
import {
  acceptInvitationWithProfile,
  createOrganizationWithTeam,
  createPosition,
  DomainError,
  ensureUser,
  inviteMember,
  listPositions,
  listTeam,
  listTeamInvitations,
  resolveActor,
  setPositionArchived,
  updateMemberProfile,
  updateMyProfile,
  updatePosition,
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

async function accessAccount(email = `p-${newId()}@example.com`, name = 'Person') {
  return db.authUser.create({ data: { id: newId(), email, name, emailVerified: true } })
}

async function adminWithOrg(name = 'Ana López', defaultLocale: 'es' | 'en' = 'es') {
  const access = await accessAccount(undefined, name)
  const user = await ensureUser(base(), access.id)
  const { organization } = await createOrganizationWithTeam(base(), user.id, {
    name: 'Acme',
    slug: `org-${newId().slice(-12)}`,
    defaultLocale,
  })
  const { actor } = await resolveActor(db, { userId: user.id, organizationId: organization.id })
  const ctx: Ctx = { ...base(), actor }
  return { organization, ctx, user }
}

/** Invites with a profile and accepts as the invited person: returns their own context. */
async function joinedMember(
  admin: Awaited<ReturnType<typeof adminWithOrg>>,
  profile: { firstName: string; lastName?: string; phone?: string; positionId?: string } = {
    firstName: 'Luis',
  },
) {
  const email = `m-${newId()}@example.com`
  const { token } = await inviteMember(admin.ctx, { email, role: 'MEMBER', ...profile })
  const access = await accessAccount(email, 'Cuenta Luis')
  const user = await ensureUser(base(), access.id)
  const member = await acceptInvitationWithProfile(base(), { token, userId: user.id })
  const { actor } = await resolveActor(db, {
    userId: user.id,
    organizationId: admin.organization.id,
  })
  return { member, ctx: { ...base(), actor } as Ctx }
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

describe('organization creation', () => {
  it('seeds the default position by language and the creator profile from the account name', async () => {
    const es = await adminWithOrg('Ana López', 'es')
    expect((await listPositions(es.ctx)).map((p) => p.name)).toEqual(['Delegado'])
    const en = await adminWithOrg('Ann Lee', 'en')
    expect((await listPositions(en.ctx)).map((p) => p.name)).toEqual(['Delegate'])
    const team = await listTeam(es.ctx)
    expect(team).toHaveLength(1)
    expect(team[0]).toMatchObject({
      displayName: 'Ana López',
      role: 'ADMIN',
      profile: { firstName: 'Ana López', lastName: null, phone: null, position: null },
    })
  })
})

describe('positions', () => {
  it('an ADMIN creates, renames and orders them; names are unique ignoring case', async () => {
    const { ctx } = await adminWithOrg()
    const president = await createPosition(ctx, { name: 'Presidente' })
    expect(president.sortOrder).toBe(1)
    await updatePosition(ctx, president.id, { name: 'Presidencia', sortOrder: 5 })
    const treasurer = await createPosition(ctx, { name: 'Tesorero' })
    await updatePosition(ctx, treasurer.id, { sortOrder: 3 })
    expect(await codeOf(createPosition(ctx, { name: 'presidencia' }))).toEqual({
      code: 'CONFLICT',
      detail: 'NAME_TAKEN',
    })
    await expect(createPosition(ctx, { name: '   ' })).rejects.toBeInstanceOf(ZodError)
    const names = (await listPositions(ctx)).map((p) => p.name)
    expect(names).toEqual(['Delegado', 'Tesorero', 'Presidencia'])
  })

  it('archiving hides it from the offer but keeps it on the people who have it', async () => {
    const admin = await adminWithOrg()
    const president = await createPosition(admin.ctx, { name: 'Presidente' })
    const { member } = await joinedMember(admin, { firstName: 'Eva', positionId: president.id })
    await setPositionArchived(admin.ctx, president.id, true)
    await setPositionArchived(admin.ctx, president.id, true) // idempotent
    expect((await listPositions(admin.ctx)).map((p) => p.name)).toEqual(['Delegado'])
    expect(await listPositions(admin.ctx, { includeArchived: true })).toHaveLength(2)
    const eva = (await listTeam(admin.ctx)).find((m) => m.id === member.id)
    expect(eva?.profile?.position).toEqual({ id: president.id, name: 'Presidente', archived: true })
    // An archived position cannot be given to anyone new.
    expect(
      await codeOf(
        inviteMember(admin.ctx, {
          email: 'x@example.com',
          firstName: 'X',
          positionId: president.id,
        }),
      ),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'INVALID_POSITION' })
    await setPositionArchived(admin.ctx, president.id, false)
    expect(await listPositions(admin.ctx)).toHaveLength(2)
  })

  it('a MEMBER can read the positions but not manage them', async () => {
    const admin = await adminWithOrg()
    const { ctx } = await joinedMember(admin)
    expect(await listPositions(ctx)).toHaveLength(1)
    expect(await codeOf(createPosition(ctx, { name: 'Secretaria' }))).toMatchObject({
      code: 'FORBIDDEN',
    })
    const [first] = await listPositions(ctx)
    expect(await codeOf(updatePosition(ctx, first!.id, { name: 'Otro' }))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await codeOf(setPositionArchived(ctx, first!.id, true))).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('creating and archiving are audited', async () => {
    const { ctx, organization } = await adminWithOrg()
    const p = await createPosition(ctx, { name: 'Tesorero' })
    await setPositionArchived(ctx, p.id, true)
    const actions = await withTenant(db, organization.id, (tx) =>
      tx.auditLog.findMany({ where: { resourceType: 'member_position' }, orderBy: { id: 'asc' } }),
    )
    expect(actions.map((a) => a.action)).toEqual(['position.created', 'position.archived'])
  })
})

describe('invitation with profile', () => {
  it('carries name, phone and position from the invitation to the member profile', async () => {
    const admin = await adminWithOrg()
    const [delegate] = await listPositions(admin.ctx)
    const email = `m-${newId()}@example.com`
    const { token } = await inviteMember(admin.ctx, {
      email,
      role: 'MEMBER',
      firstName: ' Luis ',
      lastName: 'Pérez',
      phone: '+34 600-111-222',
      positionId: delegate!.id,
    })
    const pending = await listTeamInvitations(admin.ctx)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.profile).toEqual({
      firstName: 'Luis',
      lastName: 'Pérez',
      phone: '+34600111222',
      position: { id: delegate!.id, name: 'Delegado' },
    })
    const access = await accessAccount(email, 'Cuenta de Luis')
    const user = await ensureUser(base(), access.id)
    const member = await acceptInvitationWithProfile(base(), { token, userId: user.id })
    const luis = (await listTeam(admin.ctx)).find((m) => m.id === member.id)
    expect(luis).toMatchObject({
      role: 'MEMBER',
      displayName: 'Luis Pérez',
      email,
      profile: {
        firstName: 'Luis',
        lastName: 'Pérez',
        phone: '+34600111222',
        position: { id: delegate!.id, name: 'Delegado', archived: false },
      },
    })
    expect(await listTeamInvitations(admin.ctx)).toHaveLength(0)
  })

  it('only the first name is required', async () => {
    const admin = await adminWithOrg()
    const { member } = await joinedMember(admin, { firstName: 'Marta' })
    const marta = (await listTeam(admin.ctx)).find((m) => m.id === member.id)
    expect(marta?.profile).toMatchObject({ firstName: 'Marta', lastName: null, phone: null })
    expect(marta?.profile?.position).toBeNull()
    await expect(
      inviteMember(admin.ctx, { email: 'a@example.com', firstName: '' }),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('rejects a malformed phone and leaves no invitation behind', async () => {
    const admin = await adminWithOrg()
    const email = `bad-${newId()}@example.com`
    await expect(
      inviteMember(admin.ctx, { email, firstName: 'A', phone: '600111222' }),
    ).rejects.toBeInstanceOf(ZodError)
    const count = await withTenant(db, admin.organization.id, (tx) =>
      tx.invitation.count({ where: { email } }),
    )
    expect(count).toBe(0)
  })

  it('is atomic: a position of another organization rolls the whole invitation back', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const [foreign] = await listPositions(b.ctx)
    const email = `atomic-${newId()}@example.com`
    expect(
      await codeOf(inviteMember(a.ctx, { email, firstName: 'A', positionId: foreign!.id })),
    ).toEqual({ code: 'VALIDATION_FAILED', detail: 'INVALID_POSITION' })
    const count = await withTenant(db, a.organization.id, (tx) =>
      tx.invitation.count({ where: { email } }),
    )
    expect(count).toBe(0)
  })

  it('a MEMBER cannot invite', async () => {
    const admin = await adminWithOrg()
    const { ctx } = await joinedMember(admin)
    expect(
      await codeOf(inviteMember(ctx, { email: 'z@example.com', firstName: 'Z' })),
    ).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('an invitation that predates profiles falls back to the account name', async () => {
    const admin = await adminWithOrg()
    const { createInvitation } = await import('../src/index.ts')
    const email = `old-${newId()}@example.com`
    const { token } = await createInvitation(admin.ctx, { email, role: 'MEMBER' })
    const access = await accessAccount(email, 'Cuenta Antigua')
    const user = await ensureUser(base(), access.id)
    const member = await acceptInvitationWithProfile(base(), { token, userId: user.id })
    const found = (await listTeam(admin.ctx)).find((m) => m.id === member.id)
    expect(found?.profile?.firstName).toBe('Cuenta Antigua')
  })
})

describe('profiles', () => {
  it('an ADMIN edits any profile, including position and private notes', async () => {
    const admin = await adminWithOrg()
    const { member } = await joinedMember(admin)
    const [delegate] = await listPositions(admin.ctx)
    await updateMemberProfile(admin.ctx, member.id, {
      firstName: 'Luis',
      lastName: 'Pérez',
      phone: '+34600111222',
      contactEmail: 'LUIS@Example.com',
      positionId: delegate!.id,
      notes: 'Cubre la zona norte',
    })
    const luis = (await listTeam(admin.ctx)).find((m) => m.id === member.id)
    expect(luis?.profile).toMatchObject({
      contactEmail: 'luis@example.com',
      notes: 'Cubre la zona norte',
      position: { name: 'Delegado' },
    })
    // Removing the position and blanking optional fields.
    await updateMemberProfile(admin.ctx, member.id, {
      firstName: 'Luis',
      lastName: '',
      phone: '',
      positionId: null,
    })
    const cleared = (await listTeam(admin.ctx)).find((m) => m.id === member.id)
    expect(cleared?.profile).toMatchObject({ lastName: null, phone: null, position: null })
  })

  it('a MEMBER edits their own name, phone and email, never position or notes, nor anyone else', async () => {
    const admin = await adminWithOrg()
    const luis = await joinedMember(admin)
    const [delegate] = await listPositions(admin.ctx)
    await updateMyProfile(luis.ctx, {
      firstName: 'Luis',
      phone: '+34611222333',
      // Position and notes are not part of the self-service schema: they are dropped.
      ...({ positionId: delegate!.id, notes: 'hack' } as object),
    })
    const seenByAdmin = (await listTeam(admin.ctx)).find((m) => m.id === luis.member.id)
    expect(seenByAdmin?.profile).toMatchObject({
      phone: '+34611222333',
      position: null,
      notes: null,
    })
    expect(
      await codeOf(updateMemberProfile(luis.ctx, admin.ctx.actor.memberId, { firstName: 'X' })),
    ).toMatchObject({ code: 'FORBIDDEN' })
  })

  it('private notes are only visible to whoever manages profiles', async () => {
    const admin = await adminWithOrg()
    const luis = await joinedMember(admin)
    await updateMemberProfile(admin.ctx, luis.member.id, { firstName: 'Luis', notes: 'privado' })
    const asMember = (await listTeam(luis.ctx)).find((m) => m.id === luis.member.id)
    expect(asMember?.profile?.notes).toBeNull()
    const asAdmin = (await listTeam(admin.ctx)).find((m) => m.id === luis.member.id)
    expect(asAdmin?.profile?.notes).toBe('privado')
  })

  it('profile changes are audited without personal data', async () => {
    const admin = await adminWithOrg()
    const luis = await joinedMember(admin)
    await updateMemberProfile(admin.ctx, luis.member.id, {
      firstName: 'Luis',
      phone: '+34600111222',
    })
    const rows = await withTenant(db, admin.organization.id, (tx) =>
      tx.auditLog.findMany({ where: { action: 'member_profile.updated' } }),
    )
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows[0]?.after)).not.toContain('600111222')
  })

  it('a profile cannot be written for a member of another organization', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    expect(
      await codeOf(updateMemberProfile(a.ctx, b.ctx.actor.memberId, { firstName: 'Intruso' })),
    ).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('tenant isolation', () => {
  it('positions and profiles of one organization are invisible to another', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    await createPosition(a.ctx, { name: 'Solo de A' })
    const seenByB = await listPositions(b.ctx, { includeArchived: true })
    expect(seenByB.map((p) => p.name)).toEqual(['Delegado'])
    const [rows, profiles] = await withTenant(db, b.organization.id, async (tx) => [
      await tx.memberPosition.count({ where: { organizationId: a.organization.id } }),
      await tx.memberProfile.count({ where: { organizationId: a.organization.id } }),
    ])
    expect([rows, profiles]).toEqual([0, 0])
  })
})
