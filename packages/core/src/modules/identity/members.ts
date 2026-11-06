import { withTenant, type OrganizationRole, type TenantTx } from '@saas/database'
import { z } from 'zod'
import { nowOf, type Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from './authorization.ts'

const tenantTx = <T>(ctx: Ctx, fn: (tx: TenantTx) => Promise<T>) =>
  withTenant(ctx.db, ctx.actor.organizationId, fn)

/** Members of the active organization, with their visible name. */
export async function listMembers(ctx: Ctx) {
  authorize(ctx.actor, 'members.read')
  return tenantTx(ctx, async (tx) => {
    const members = await tx.organizationMember.findMany({
      include: { user: { select: { displayName: true } } },
      orderBy: { joinedAt: 'asc' },
    })
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      displayName: m.user.displayName,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
    }))
  })
}

async function assertAnotherActiveAdmin(tx: TenantTx, memberId: string) {
  const admins = await tx.organizationMember.count({
    where: { role: 'ADMIN', status: 'ACTIVE', id: { not: memberId } },
  })
  if (admins === 0) {
    throw new DomainError('CONFLICT', 'The organization must keep an active ADMIN', [
      { code: 'LAST_ADMIN' },
    ])
  }
}

export const ChangeRoleInput = z.object({ role: z.enum(['ADMIN', 'MEMBER']) })

/** Changes a member's role. The organization always keeps at least one active ADMIN. */
export async function changeMemberRole(
  ctx: Ctx,
  memberId: string,
  input: { role: OrganizationRole },
) {
  authorize(ctx.actor, 'members.manage')
  const { role } = ChangeRoleInput.parse(input)
  return tenantTx(ctx, async (tx) => {
    const member = await tx.organizationMember.findUnique({ where: { id: memberId } })
    if (!member) throw new DomainError('NOT_FOUND', 'Member not found')
    if (member.role === role) return member
    if (member.role === 'ADMIN') await assertAnotherActiveAdmin(tx, memberId)
    const updated = await tx.organizationMember.update({ where: { id: memberId }, data: { role } })
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'member.role_changed',
      resourceType: 'organization_member',
      resourceId: memberId,
      before: { role: member.role },
      after: { role },
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return updated
  })
}

/** Disables a member: they keep their history but can no longer act in the organization. */
export async function disableMember(ctx: Ctx, memberId: string) {
  authorize(ctx.actor, 'members.manage')
  return tenantTx(ctx, async (tx) => {
    const member = await tx.organizationMember.findUnique({ where: { id: memberId } })
    if (!member) throw new DomainError('NOT_FOUND', 'Member not found')
    if (member.status === 'DISABLED') return member
    if (member.role === 'ADMIN') await assertAnotherActiveAdmin(tx, memberId)
    const updated = await tx.organizationMember.update({
      where: { id: memberId },
      data: { status: 'DISABLED', disabledAt: nowOf(ctx) },
    })
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'member.disabled',
      resourceType: 'organization_member',
      resourceId: memberId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return updated
  })
}
