import { withTenant, type MemberProfile, type TenantTx } from '@saas/database'
import type { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize, can, listMembers } from '../identity/index.ts'
import { assertAssignablePosition } from './positions.ts'
import { MemberProfileInput, MyProfileInput } from './schemas.ts'

/**
 * A member with the data of the person (D14) and their position (D15). The position is only
 * shown: no rule or permission reads it.
 */
export interface TeamMember {
  id: string
  userId: string
  /** Name shown in the organization: the profile's, or the person's account name. */
  displayName: string
  email: string | null
  role: 'ADMIN' | 'MEMBER'
  status: 'ACTIVE' | 'DISABLED'
  joinedAt: Date
  profile: {
    firstName: string
    lastName: string | null
    phone: string | null
    contactEmail: string | null
    position: { id: string; name: string; archived: boolean } | null
    /** Only for whoever manages profiles. */
    notes: string | null
  } | null
}

export const fullName = (p: { firstName: string; lastName: string | null }) =>
  [p.firstName, p.lastName].filter(Boolean).join(' ')

/** Members of the active organization with their profile and position. */
export async function listTeam(ctx: Ctx): Promise<TeamMember[]> {
  authorize(ctx.actor, 'members.read')
  const members = await listMembers(ctx)
  const canSeeNotes = can(ctx.actor, 'member_profiles.manage')
  const profiles = await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.memberProfile.findMany({ include: { position: true } }),
  )
  const byMember = new Map(profiles.map((p) => [p.memberId, p]))
  return members.map((m) => {
    const p = byMember.get(m.id)
    return {
      ...m,
      displayName: p ? fullName(p) : m.displayName,
      profile: p
        ? {
            firstName: p.firstName,
            lastName: p.lastName,
            phone: p.phone,
            contactEmail: p.contactEmail,
            position: p.position
              ? { id: p.position.id, name: p.position.name, archived: !!p.position.archivedAt }
              : null,
            notes: canSeeNotes ? p.notes : null,
          }
        : null,
    }
  })
}

type ProfileData = z.output<typeof MemberProfileInput>

/** Writes (creates or replaces the given fields of) a member's profile. */
async function upsertProfile(
  ctx: Ctx,
  tx: TenantTx,
  memberId: string,
  data: Partial<ProfileData> & { firstName: string },
  action: string,
): Promise<MemberProfile> {
  const member = await tx.organizationMember.findUnique({ where: { id: memberId } })
  if (!member) throw new DomainError('NOT_FOUND', 'Member not found')
  if (data.positionId) await assertAssignablePosition(tx, data.positionId)
  const profile = await tx.memberProfile.upsert({
    where: {
      organizationId_memberId: { organizationId: ctx.actor.organizationId, memberId },
    },
    create: { organizationId: ctx.actor.organizationId, memberId, ...data },
    update: data,
  })
  await writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'member_profile',
    resourceId: profile.id,
    // Names, phones and emails are personal data: the audit records only which fields changed.
    after: { memberId, fields: Object.keys(data) },
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })
  return profile
}

/** An ADMIN edits any member's profile, including position and notes. */
export async function updateMemberProfile(ctx: Ctx, memberId: string, input: MemberProfileInput) {
  authorize(ctx.actor, 'member_profiles.manage')
  const data = MemberProfileInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    upsertProfile(ctx, tx, memberId, data, 'member_profile.updated'),
  )
}

/** Each member edits their own data: name, phone and contact email. Not position or notes. */
export async function updateMyProfile(ctx: Ctx, input: MyProfileInput) {
  const data = MyProfileInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    upsertProfile(ctx, tx, ctx.actor.memberId, data, 'member_profile.updated_by_self'),
  )
}

/**
 * Display names of members (the profile's name, or the account name when there is no profile),
 * for modules that show "who": reference delegates, authors of activity. Runs in the caller's
 * transaction; unknown ids are simply absent from the map.
 */
export async function displayNamesOf(
  tx: TenantTx,
  memberIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(memberIds)]
  if (unique.length === 0) return new Map()
  const members = await tx.organizationMember.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      user: { select: { displayName: true } },
      profile: { select: { firstName: true, lastName: true } },
    },
  })
  return new Map(
    members.map((m) => [m.id, m.profile ? fullName(m.profile) : m.user.displayName] as const),
  )
}
