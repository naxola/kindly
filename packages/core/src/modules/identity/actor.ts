import { withTenant, type Db } from '@saas/database'
import { DomainError } from '../../errors.ts'
import { permissionsOf, type Actor } from './authorization.ts'

/**
 * Builds the actor of `userId` (business user) in `organizationId`. Without an active
 * membership it answers NOT_FOUND, without revealing whether the organization exists.
 * The active organization is chosen by the business layer (header or cookie of the app),
 * never stored in the access session (ADR 0003).
 */
export async function resolveActor(
  db: Db,
  { userId, organizationId }: { userId: string; organizationId: string },
): Promise<{
  actor: Actor
  organization: { id: string; name: string; slug: string; defaultLocale: string }
}> {
  const membership = await withTenant(db, organizationId, (tx) =>
    tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, defaultLocale: true, archivedAt: true },
        },
      },
    }),
  )
  if (!membership || membership.status !== 'ACTIVE' || membership.organization.archivedAt) {
    throw new DomainError('NOT_FOUND', 'Organization not found')
  }
  const { id, name, slug, defaultLocale } = membership.organization
  return {
    actor: {
      userId,
      memberId: membership.id,
      organizationId,
      role: membership.role,
      permissions: permissionsOf(membership.role),
    },
    organization: { id, name, slug, defaultLocale },
  }
}
