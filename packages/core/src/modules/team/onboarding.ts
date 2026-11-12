import { withTenant, type TenantTx } from '@saas/database'
import type { BaseCtx, Ctx } from '../../context.ts'
import {
  acceptInvitation,
  authorize,
  createInvitation,
  createOrganization,
  listPendingInvitations,
  type CreateInvitationInput,
  type CreateOrganizationInput,
} from '../identity/index.ts'
import { assertAssignablePosition, seedDefaultPositions } from './positions.ts'
import { InvitationProfileInput } from './schemas.ts'

/**
 * Identity use cases composed with the team data, atomically: they hand identity small
 * callbacks that run inside its own transaction (see the hooks of core/identity).
 */

/** Creates the organization with its default positions and the creator's profile. */
export async function createOrganizationWithTeam(
  ctx: BaseCtx,
  userId: string,
  input: CreateOrganizationInput,
) {
  return createOrganization(ctx, userId, input, {
    async onCreated(tx, { organization, member }) {
      await seedDefaultPositions(tx, organization.id, organization.defaultLocale)
      await createProfileFromAccountName(tx, organization.id, member.id, userId)
    },
  })
}

/** Invites someone with the profile data chosen by the ADMIN (name, phone, position). */
export async function inviteMember(
  ctx: Ctx,
  input: CreateInvitationInput & InvitationProfileInput,
  options: { ttlDays?: number } = {},
) {
  authorize(ctx.actor, 'members.invite')
  const profile = InvitationProfileInput.parse(input)
  return createInvitation(ctx, input, {
    ...options,
    hooks: {
      async onCreated(tx, invitation) {
        if (profile.positionId) await assertAssignablePosition(tx, profile.positionId)
        await tx.invitationProfile.create({
          data: {
            organizationId: invitation.organizationId,
            invitationId: invitation.id,
            firstName: profile.firstName,
            lastName: profile.lastName ?? null,
            phone: profile.phone ?? null,
            positionId: profile.positionId ?? null,
          },
        })
      },
    },
  })
}

/** Accepts an invitation and creates the member's profile from the invitation's data. */
export async function acceptInvitationWithProfile(
  ctx: BaseCtx,
  args: { token: string; userId: string },
) {
  return acceptInvitation(ctx, args, {
    async onAccepted(tx, { invitation, member }) {
      const chosen = await tx.invitationProfile.findUnique({
        where: {
          organizationId_invitationId: {
            organizationId: invitation.organizationId,
            invitationId: invitation.id,
          },
        },
      })
      if (!chosen) {
        // An invitation sent before the team module existed: fall back to the account name.
        await createProfileFromAccountName(tx, invitation.organizationId, member.id, args.userId)
        return
      }
      await tx.memberProfile.create({
        data: {
          organizationId: invitation.organizationId,
          memberId: member.id,
          firstName: chosen.firstName,
          lastName: chosen.lastName,
          phone: chosen.phone,
          positionId: chosen.positionId,
        },
      })
    },
  })
}

/** Pending invitations with the name and position chosen for each. */
export async function listTeamInvitations(ctx: Ctx) {
  const invitations = await listPendingInvitations(ctx)
  const profiles = await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.invitationProfile.findMany({
      where: { invitationId: { in: invitations.map((i) => i.id) } },
      include: { position: { select: { id: true, name: true } } },
    }),
  )
  const byInvitation = new Map(profiles.map((p) => [p.invitationId, p]))
  return invitations.map((i) => {
    const p = byInvitation.get(i.id)
    return {
      ...i,
      profile: p
        ? {
            firstName: p.firstName,
            lastName: p.lastName,
            phone: p.phone,
            position: p.position,
          }
        : null,
    }
  })
}

async function createProfileFromAccountName(
  tx: TenantTx,
  organizationId: string,
  memberId: string,
  userId: string,
) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { displayName: true } })
  await tx.memberProfile.create({
    data: { organizationId, memberId, firstName: user?.displayName.trim() || 'Member' },
  })
}
