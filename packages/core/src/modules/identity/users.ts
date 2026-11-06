import { withUser, type Db, type TenantTx, type User } from '@saas/database'
import { DomainError } from '../../errors.ts'

/**
 * Business user of an access account (ADR 0003). Created on first entry into the product
 * (creating an organization or accepting an invitation), never at sign-up. Idempotent:
 * concurrent first entries end with a single row thanks to the unique auth_user_id.
 */
export async function ensureUser(db: Db, authUserId: string): Promise<User> {
  const existing = await db.user.findUnique({ where: { authUserId } })
  if (existing) return existing
  const access = await db.authUser.findUnique({ where: { id: authUserId } })
  if (!access) throw new DomainError('UNAUTHENTICATED', 'Unknown access account')
  return db.user.upsert({
    where: { authUserId },
    create: { authUserId, displayName: access.name.trim() || access.email.split('@')[0]! },
    update: {},
  })
}

/** Business user of an access account, or null if they have not entered the product yet. */
export const findUserByAuthId = (db: Db, authUserId: string) =>
  db.user.findUnique({ where: { authUserId } })

/**
 * Access email of a business user. Only identity may read auth_* (ADR 0003). Null if the
 * access was deleted (anonymized user).
 */
export async function accessEmailOf(tx: TenantTx | Db, userId: string): Promise<string | null> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { authUserId: true } })
  if (!user?.authUserId) return null
  const access = await tx.authUser.findUnique({
    where: { id: user.authUserId },
    select: { email: true },
  })
  return access?.email ?? null
}

/** Organizations where the user is an active member (organization picker). */
export async function listMyOrganizations(db: Db, userId: string) {
  return withUser(db, userId, async (tx) => {
    const memberships = await tx.organizationMember.findMany({
      where: { userId, status: 'ACTIVE', organization: { archivedAt: null } },
      select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { joinedAt: 'asc' },
    })
    return memberships.map((m) => ({ ...m.organization, role: m.role }))
  })
}
