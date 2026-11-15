import { withTenant, withUser, type Db } from '@saas/database'
import { z } from 'zod'
import { nowOf, type BaseCtx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { DEFAULT_LOCALE, LOCALES, isLocale, type Locale } from '../../i18n.ts'
import { defineJob } from '../../jobs.ts'
import { writeAudit } from '../audit/index.ts'
import { emitEvent } from '../events/index.ts'
import { lockOrganizationMembers } from './members.ts'

/**
 * Account deletion and personal-data export (ADR 0019). A request starts a grace period; the
 * person keeps using the product and can cancel. A daily job executes it when the period ends:
 * it deletes the access account, anonymizes the business user (history stays) and disables the
 * memberships, archiving the organizations the person was alone in.
 */

/** Decision D6 (ADR 0019): the same grace period for every account. */
export const ACCOUNT_DELETION_GRACE_DAYS = 14
const DAY = 24 * 60 * 60 * 1000
/** Neutral name of an anonymized user (shown where history mentions them). */
export const ANONYMIZED_DISPLAY_NAME = 'Deleted user'

export const ACCOUNT_DELETION_EMAIL_KINDS = [
  'REQUESTED',
  'CANCELLED',
  'COMPLETED',
  'BLOCKED',
] as const
export type AccountDeletionEmailKind = (typeof ACCOUNT_DELETION_EMAIL_KINDS)[number]

export const accountDeletionEmailJob = defineJob({
  name: 'identity.account-deletion-email',
  schema: z.object({
    to: z.email(),
    name: z.string(),
    locale: z.enum(LOCALES),
    kind: z.enum(ACCOUNT_DELETION_EMAIL_KINDS),
    /** When the deletion will happen (REQUESTED only). */
    scheduledFor: z.iso.datetime().optional(),
    url: z.url(),
  }),
})

export const processAccountDeletionsJob = defineJob({
  name: 'identity.process-account-deletions',
  schema: z.object({}),
  retryLimit: 2,
  retryDelaySeconds: 600,
})

/** Every day, in the small hours (UTC). */
export const IDENTITY_SCHEDULES = [{ job: processAccountDeletionsJob, cron: '11 4 * * *' }] as const

export type DeletionBlockerCode = 'LAST_ADMIN' | 'ORGANIZATION_HAS_SUBSCRIPTION'
export interface DeletionBlocker {
  code: DeletionBlockerCode
  organizationId: string
  organizationName: string
}
interface DeletionPlan {
  blockers: DeletionBlocker[]
  /** Organizations where the person is the only active member: archived on execution. */
  archive: { id: string; name: string }[]
}

/**
 * What would happen if the deletion ran now (ADR 0019): the rules that block it and the
 * organizations that would be archived. Read-only; used at the request and again at execution.
 */
async function planDeletion(db: Db, userId: string): Promise<DeletionPlan> {
  const memberships = await withUser(db, userId, (tx) =>
    tx.organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, role: true, organizationId: true },
    }),
  )
  const plan: DeletionPlan = { blockers: [], archive: [] }
  for (const m of memberships) {
    await withTenant(db, m.organizationId, async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: m.organizationId },
        select: { id: true, name: true, archivedAt: true },
      })
      if (!organization || organization.archivedAt) return
      const others = await tx.organizationMember.count({
        where: { status: 'ACTIVE', id: { not: m.id } },
      })
      if (others === 0) {
        const subscription = await tx.subscription.findUnique({
          where: { organizationId: m.organizationId },
          select: { provider: true, status: true },
        })
        if (subscription?.provider && subscription.status !== 'CANCELED') {
          plan.blockers.push({
            code: 'ORGANIZATION_HAS_SUBSCRIPTION',
            organizationId: organization.id,
            organizationName: organization.name,
          })
        } else {
          plan.archive.push({ id: organization.id, name: organization.name })
        }
        return
      }
      if (m.role === 'ADMIN') {
        const otherAdmins = await tx.organizationMember.count({
          where: { role: 'ADMIN', status: 'ACTIVE', id: { not: m.id } },
        })
        if (otherAdmins === 0) {
          plan.blockers.push({
            code: 'LAST_ADMIN',
            organizationId: organization.id,
            organizationName: organization.name,
          })
        }
      }
    })
  }
  return plan
}

const blockedError = (blockers: DeletionBlocker[]) =>
  new DomainError(
    'CONFLICT',
    'The account cannot be deleted yet',
    blockers.map((b) => ({ path: b.organizationName, code: b.code, message: b.organizationId })),
  )

export interface AccountDeletionState {
  requestedAt: Date
  scheduledFor: Date
}

/** Pending deletion of a person, or null. */
export async function accountDeletionState(
  db: Db,
  userId: string,
): Promise<AccountDeletionState | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { deletionRequestedAt: true, deletionScheduledFor: true },
  })
  if (!user?.deletionRequestedAt || !user.deletionScheduledFor) return null
  return { requestedAt: user.deletionRequestedAt, scheduledFor: user.deletionScheduledFor }
}

/**
 * What blocks the deletion and what it would archive, so the screen can show it before the
 * person types their password.
 */
export async function previewAccountDeletion(db: Db, userId: string) {
  return planDeletion(db, userId)
}

/**
 * The person asks to delete their account. The caller has already checked their password
 * (re-authentication, an access concern that lives in the adapter). Idempotent: a second
 * request keeps the first date.
 */
export async function requestAccountDeletion(ctx: BaseCtx, userId: string) {
  const plan = await planDeletion(ctx.db, userId)
  if (plan.blockers.length > 0) throw blockedError(plan.blockers)
  const now = nowOf(ctx)
  const result = await ctx.db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } })
    if (!user || user.anonymizedAt || !user.authUserId) {
      throw new DomainError('NOT_FOUND', 'User not found')
    }
    if (user.deletionScheduledFor) {
      return { scheduledFor: user.deletionScheduledFor, created: false }
    }
    const scheduledFor = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY)
    await tx.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: now, deletionScheduledFor: scheduledFor },
    })
    await writeAudit(tx, {
      organizationId: null,
      actorUserId: userId,
      action: 'user.deletion_requested',
      resourceType: 'user',
      resourceId: userId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    const access = await tx.authUser.findUnique({
      where: { id: user.authUserId },
      select: { email: true },
    })
    if (access) {
      await ctx.queue.enqueue(
        tx,
        accountDeletionEmailJob,
        {
          to: access.email,
          name: user.displayName,
          locale: localeOf(user.locale),
          kind: 'REQUESTED',
          scheduledFor: scheduledFor.toISOString(),
          url: `${ctx.appUrl}/settings/account`,
        },
        {
          idempotencyKey: `account-deletion:requested:${userId}:${scheduledFor.toISOString()}`,
          organizationId: null,
          correlationId: ctx.correlationId,
        },
      )
    }
    return { scheduledFor, created: true }
  })
  return { scheduledFor: result.scheduledFor, archive: plan.archive }
}

/** The person changes their mind during the grace period. */
export async function cancelAccountDeletion(ctx: BaseCtx, userId: string) {
  await ctx.db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } })
    if (!user || user.anonymizedAt) throw new DomainError('NOT_FOUND', 'User not found')
    if (!user.deletionScheduledFor) return
    await tx.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null, deletionScheduledFor: null },
    })
    await writeAudit(tx, {
      organizationId: null,
      actorUserId: userId,
      action: 'user.deletion_cancelled',
      resourceType: 'user',
      resourceId: userId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    const access = user.authUserId
      ? await tx.authUser.findUnique({ where: { id: user.authUserId }, select: { email: true } })
      : null
    if (access) {
      await ctx.queue.enqueue(
        tx,
        accountDeletionEmailJob,
        {
          to: access.email,
          name: user.displayName,
          locale: localeOf(user.locale),
          kind: 'CANCELLED',
          url: `${ctx.appUrl}/settings/account`,
        },
        {
          idempotencyKey: `account-deletion:cancelled:${userId}:${user.deletionScheduledFor.toISOString()}`,
          organizationId: null,
          correlationId: ctx.correlationId,
        },
      )
    }
  })
}

const localeOf = (value: string | null): Locale => (isLocale(value) ? value : DEFAULT_LOCALE)

/**
 * Executes every request whose grace period ended. Idempotent and safe to re-run: a person
 * already anonymized has no pending request, and a crash halfway leaves memberships already
 * disabled, which the next run simply skips. A rule that started blocking during the grace
 * period (the person became the last ADMIN) cancels the request and tells them.
 */
export async function processAccountDeletions(ctx: BaseCtx) {
  const now = nowOf(ctx)
  const due = await ctx.db.user.findMany({
    where: { deletionScheduledFor: { lte: now }, anonymizedAt: null },
    select: { id: true },
    orderBy: { deletionScheduledFor: 'asc' },
    take: 200,
  })
  const result = { deleted: 0, blocked: 0 }
  for (const { id } of due) {
    const outcome = await executeDeletion(ctx, id)
    if (outcome === 'deleted') result.deleted++
    else if (outcome === 'blocked') result.blocked++
  }
  return result
}

async function executeDeletion(
  ctx: BaseCtx,
  userId: string,
): Promise<'deleted' | 'blocked' | 'skipped'> {
  const now = nowOf(ctx)
  const user = await ctx.db.user.findUnique({ where: { id: userId } })
  if (!user || user.anonymizedAt || !user.deletionScheduledFor || user.deletionScheduledFor > now) {
    return 'skipped'
  }
  const access = user.authUserId
    ? await ctx.db.authUser.findUnique({
        where: { id: user.authUserId },
        select: { email: true },
      })
    : null
  const locale = localeOf(user.locale)
  const plan = await planDeletion(ctx.db, userId)
  if (plan.blockers.length > 0) {
    await ctx.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: null, deletionScheduledFor: null },
      })
      await writeAudit(tx, {
        organizationId: null,
        actorUserId: userId,
        action: 'user.deletion_blocked',
        resourceType: 'user',
        resourceId: userId,
        after: { reasons: plan.blockers.map((b) => b.code) },
        correlationId: ctx.correlationId,
      })
      if (access) {
        await ctx.queue.enqueue(
          tx,
          accountDeletionEmailJob,
          {
            to: access.email,
            name: user.displayName,
            locale,
            kind: 'BLOCKED',
            url: `${ctx.appUrl}/settings/account`,
          },
          {
            idempotencyKey: `account-deletion:blocked:${userId}:${user.deletionScheduledFor!.toISOString()}`,
            organizationId: null,
            correlationId: ctx.correlationId,
          },
        )
      }
    })
    return 'blocked'
  }

  // Memberships first, one organization at a time (each under its own tenant): they can be
  // repeated safely. The access account and the anonymization go last, in one transaction.
  const archiveIds = new Set(plan.archive.map((o) => o.id))
  const memberships = await withUser(ctx.db, userId, (tx) =>
    tx.organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, organizationId: true },
    }),
  )
  for (const m of memberships) {
    await withTenant(ctx.db, m.organizationId, async (tx) => {
      await lockOrganizationMembers(tx, m.organizationId)
      await tx.organizationMember.update({
        where: { id: m.id },
        data: { status: 'DISABLED', disabledAt: now },
      })
      await writeAudit(tx, {
        organizationId: m.organizationId,
        actorUserId: userId,
        action: 'member.left',
        resourceType: 'organization_member',
        resourceId: m.id,
        correlationId: ctx.correlationId,
      })
      if (archiveIds.has(m.organizationId)) {
        await tx.organization.update({
          where: { id: m.organizationId },
          data: { archivedAt: now },
        })
        await writeAudit(tx, {
          organizationId: m.organizationId,
          actorUserId: userId,
          action: 'organization.archived',
          resourceType: 'organization',
          resourceId: m.organizationId,
          correlationId: ctx.correlationId,
        })
      }
    })
  }

  await ctx.db.$transaction(async (tx) => {
    if (user.authUserId) {
      // Sessions, accounts and second factor go with it (cascade); verification tokens are
      // keyed by address, not by id.
      if (access) await tx.authVerification.deleteMany({ where: { identifier: access.email } })
      await tx.authUser.deleteMany({ where: { id: user.authUserId } })
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        authUserId: null,
        displayName: ANONYMIZED_DISPLAY_NAME,
        locale: null,
        anonymizedAt: now,
        deletionRequestedAt: null,
        deletionScheduledFor: null,
      },
    })
    await writeAudit(tx, {
      organizationId: null,
      actorUserId: userId,
      action: 'user.deleted',
      resourceType: 'user',
      resourceId: userId,
      correlationId: ctx.correlationId,
    })
    // The CRM learns that the person is gone: the id only, never the address.
    await emitEvent(ctx, tx, {
      type: 'user.deleted',
      organizationId: null,
      subjectId: userId,
      data: { userId },
    })
    if (access) {
      await ctx.queue.enqueue(
        tx,
        accountDeletionEmailJob,
        { to: access.email, name: user.displayName, locale, kind: 'COMPLETED', url: ctx.appUrl },
        {
          idempotencyKey: `account-deletion:completed:${userId}`,
          organizationId: null,
          correlationId: ctx.correlationId,
        },
      )
    }
  })
  return 'deleted'
}

const EXPORT_ACTIVITY_LIMIT = 5000

/**
 * Everything the product holds about one person (portability, ADR 0019): profile, access data,
 * memberships and the audit entries they authored in their organizations. Entries without an
 * organization (sign-in settings, the deletion request itself) are not readable by the
 * application role by design and are not included.
 */
export async function exportPersonalData(ctx: BaseCtx, userId: string) {
  const user = await ctx.db.user.findUnique({ where: { id: userId } })
  if (!user || user.anonymizedAt) throw new DomainError('NOT_FOUND', 'User not found')
  const access = user.authUserId
    ? await ctx.db.authUser.findUnique({
        where: { id: user.authUserId },
        select: { email: true, emailVerified: true, twoFactorEnabled: true, createdAt: true },
      })
    : null
  const memberships = await withUser(ctx.db, userId, (tx) =>
    tx.organizationMember.findMany({
      where: { userId },
      select: {
        id: true,
        organizationId: true,
        role: true,
        status: true,
        joinedAt: true,
        disabledAt: true,
      },
      orderBy: { joinedAt: 'asc' },
    }),
  )
  const organizations: {
    id: string
    name: string
    slug: string
    role: string
    status: string
    joinedAt: Date
    disabledAt: Date | null
  }[] = []
  const activity: {
    organizationId: string
    action: string
    resourceType: string
    resourceId: string | null
    createdAt: Date
  }[] = []
  let truncated = false
  for (const m of memberships) {
    await withTenant(ctx.db, m.organizationId, async (tx) => {
      const organization = await tx.organization.findUnique({
        where: { id: m.organizationId },
        select: { id: true, name: true, slug: true },
      })
      if (organization) {
        organizations.push({
          ...organization,
          role: m.role,
          status: m.status,
          joinedAt: m.joinedAt,
          disabledAt: m.disabledAt,
        })
      }
      const rows = await tx.auditLog.findMany({
        where: { actorType: 'USER', actorId: userId },
        select: { action: true, resourceType: true, resourceId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: EXPORT_ACTIVITY_LIMIT + 1,
      })
      if (rows.length > EXPORT_ACTIVITY_LIMIT) truncated = true
      for (const r of rows.slice(0, EXPORT_ACTIVITY_LIMIT)) {
        activity.push({ organizationId: m.organizationId, ...r })
      }
    })
  }
  return {
    exportedAt: nowOf(ctx),
    profile: {
      id: user.id,
      displayName: user.displayName,
      locale: user.locale,
      createdAt: user.createdAt,
      deletionScheduledFor: user.deletionScheduledFor,
    },
    access: access
      ? {
          email: access.email,
          emailVerified: access.emailVerified,
          twoFactorEnabled: access.twoFactorEnabled,
          createdAt: access.createdAt,
        }
      : null,
    organizations,
    activity,
    activityTruncated: truncated,
  }
}
