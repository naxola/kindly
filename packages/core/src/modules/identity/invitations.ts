import {
  Prisma,
  withInvitationToken,
  withTenant,
  type Invitation,
  type OrganizationMember,
  type OrganizationRole,
  type TenantTx,
} from '@saas/database'
import { z } from 'zod'
import { nowOf, type BaseCtx, type Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { isLocale, DEFAULT_LOCALE } from '../../i18n.ts'
import { writeAudit } from '../audit/index.ts'
import { emitEvent } from '../events/index.ts'
import { authorize } from './authorization.ts'
import { invitationEmailJob } from './jobs.ts'
import { hashToken, newToken } from './tokens.ts'
import { accessEmailOf } from './users.ts'

/** SUPUESTO: invitations last 7 days. Configurable per call. */
export const INVITATION_TTL_DAYS = 7

export const CreateInvitationInput = z.object({
  email: z.email().trim().toLowerCase(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
})
export type CreateInvitationInput = z.input<typeof CreateInvitationInput>

/**
 * Acceptance page in apps/web. The raw token travels in the URL fragment: browsers never
 * send it to the server, so it does not end up in access logs, proxies or Referer headers.
 */
export const invitationUrl = (appUrl: string, token: string) =>
  `${appUrl.replace(/\/$/, '')}/invite#${token}`

/**
 * Extension points for products: they run inside the transaction of the invitation, so what
 * they write exists if and only if the invitation (or the membership) does.
 */
export interface InvitationHooks {
  onCreated?: (tx: TenantTx, invitation: Invitation) => Promise<void>
  onAccepted?: (
    tx: TenantTx,
    accepted: { invitation: { id: string; organizationId: string }; member: OrganizationMember },
  ) => Promise<void>
}

/**
 * Creates an invitation and, in the same transaction, enqueues its email and the
 * `invitation.created` event. The raw token is returned once (for tests and tools);
 * only its hash is stored.
 */
export async function createInvitation(
  ctx: Ctx,
  input: CreateInvitationInput,
  { ttlDays = INVITATION_TTL_DAYS, hooks = {} }: { ttlDays?: number; hooks?: InvitationHooks } = {},
) {
  authorize(ctx.actor, 'members.invite')
  const { email, role } = CreateInvitationInput.parse(input)
  const token = newToken()
  const now = nowOf(ctx)
  const invitation = await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const pending = await tx.invitation.findFirst({
      where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    })
    if (pending) {
      throw new DomainError('CONFLICT', 'There is already a pending invitation for that email', [
        { path: 'email', code: 'PENDING_INVITATION' },
      ])
    }
    const created = await tx.invitation.create({
      data: {
        organizationId: ctx.actor.organizationId,
        email,
        role,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000),
        invitedById: ctx.actor.memberId,
      },
    })
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'invitation.created',
      resourceType: 'invitation',
      resourceId: created.id,
      after: { role },
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    const [organization, inviter] = await Promise.all([
      tx.organization.findUnique({
        where: { id: ctx.actor.organizationId },
        select: { name: true, defaultLocale: true },
      }),
      tx.user.findUnique({ where: { id: ctx.actor.userId }, select: { displayName: true } }),
    ])
    await ctx.queue.enqueue(
      tx,
      invitationEmailJob,
      {
        to: email,
        locale: isLocale(organization?.defaultLocale) ? organization.defaultLocale : DEFAULT_LOCALE,
        organizationName: organization?.name ?? '',
        inviterName: inviter?.displayName ?? '',
        url: invitationUrl(ctx.appUrl, token),
        expiresInDays: ttlDays,
      },
      {
        organizationId: ctx.actor.organizationId,
        correlationId: ctx.correlationId,
        idempotencyKey: `invitation:${created.id}`,
      },
    )
    await emitEvent(ctx, tx, {
      type: 'invitation.created',
      organizationId: ctx.actor.organizationId,
      subjectId: created.id,
      data: { invitationId: created.id, role },
    })
    await hooks.onCreated?.(tx, created)
    return created
  })
  return { invitation, token }
}

export async function revokeInvitation(ctx: Ctx, invitationId: string) {
  authorize(ctx.actor, 'members.invite')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: nowOf(ctx) },
    })
    if (count === 0) throw new DomainError('NOT_FOUND', 'Pending invitation not found')
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'invitation.revoked',
      resourceType: 'invitation',
      resourceId: invitationId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
  })
}

export async function listPendingInvitations(ctx: Ctx) {
  authorize(ctx.actor, 'members.invite')
  return withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.invitation.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: nowOf(ctx) } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  )
}

export type InvitationStatus = 'PENDING' | 'EXPIRED' | 'REVOKED' | 'ACCEPTED'

export interface InvitationView {
  id: string
  organizationId: string
  organizationName: string
  email: string
  role: OrganizationRole
  status: InvitationStatus
  expiresAt: Date
  /**
   * Whether the invited email already has an access account. Only shown to whoever holds
   * the token (sent to that very inbox), to offer sign-in instead of sign-up.
   */
  emailRegistered: boolean
}

/** Public view of an invitation by its token (acceptance page). Null if it does not exist. */
export async function getInvitationByToken(
  ctx: Pick<BaseCtx, 'db' | 'now'>,
  token: string,
): Promise<InvitationView | null> {
  const row = await withInvitationToken(ctx.db, hashToken(token), (tx) =>
    tx.invitation.findUnique({ where: { tokenHash: hashToken(token) } }),
  )
  if (!row) return null
  // The organization name is read in its own tenant context: the token context only sees the row.
  const organization = await withTenant(ctx.db, row.organizationId, (tx) =>
    tx.organization.findUnique({ where: { id: row.organizationId }, select: { name: true } }),
  )
  const status: InvitationStatus = row.acceptedAt
    ? 'ACCEPTED'
    : row.revokedAt
      ? 'REVOKED'
      : row.expiresAt <= nowOf(ctx)
        ? 'EXPIRED'
        : 'PENDING'
  const registered = await ctx.db.authUser.findUnique({
    where: { email: row.email },
    select: { id: true },
  })
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: organization?.name ?? '',
    email: row.email,
    role: row.role,
    status,
    expiresAt: row.expiresAt,
    emailRegistered: !!registered,
  }
}

/**
 * Accepts an invitation for a business user. The user's access email must match the
 * invited email: an invitation link forwarded to someone else is useless.
 */
export async function acceptInvitation(
  ctx: BaseCtx,
  { token, userId }: { token: string; userId: string },
  hooks: Pick<InvitationHooks, 'onAccepted'> = {},
) {
  const view = await getInvitationByToken(ctx, token)
  if (!view) throw new DomainError('NOT_FOUND', 'Invitation not found')
  if (view.status !== 'PENDING') {
    throw new DomainError('CONFLICT', `Invitation is ${view.status.toLowerCase()}`, [
      { code: `INVITATION_${view.status}` },
    ])
  }
  const email = await accessEmailOf(ctx.db, userId)
  if (!email || email.toLowerCase() !== view.email.toLowerCase()) {
    throw new DomainError('FORBIDDEN', 'Invitation belongs to another email', [
      { code: 'EMAIL_MISMATCH' },
    ])
  }
  const now = nowOf(ctx)
  try {
    return await withTenant(ctx.db, view.organizationId, async (tx) => {
      // Guarded update: two concurrent acceptances cannot both succeed.
      const { count } = await tx.invitation.updateMany({
        where: { id: view.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { acceptedAt: now, acceptedByUserId: userId },
      })
      if (count === 0) throw new DomainError('CONFLICT', 'Invitation is no longer pending')
      const member = await tx.organizationMember.create({
        data: { organizationId: view.organizationId, userId, role: view.role, joinedAt: now },
      })
      await writeAudit(tx, {
        organizationId: view.organizationId,
        actorUserId: userId,
        action: 'invitation.accepted',
        resourceType: 'invitation',
        resourceId: view.id,
        after: { memberId: member.id, role: view.role },
        correlationId: ctx.correlationId,
        ip: ctx.ip,
      })
      await emitEvent(ctx, tx, {
        type: 'member.joined',
        organizationId: view.organizationId,
        subjectId: member.id,
        data: { memberId: member.id, userId, role: view.role },
      })
      await hooks.onAccepted?.(tx, {
        invitation: { id: view.id, organizationId: view.organizationId },
        member,
      })
      return member
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('CONFLICT', 'Already a member of this organization', [
        { code: 'ALREADY_MEMBER' },
      ])
    }
    throw error
  }
}
