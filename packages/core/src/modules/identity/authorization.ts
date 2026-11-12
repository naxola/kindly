import type { OrganizationRole } from '@saas/database'
import { DomainError } from '../../errors.ts'
import { ROLE_PERMISSIONS, type Permission } from './permissions.ts'

/**
 * Authenticated business actor inside its active organization (ADR 0003). It never
 * carries access data (auth_*): the rest of core only knows the business identity.
 */
export interface Actor {
  /** Business user (users.id). */
  userId: string
  /** organization_members.id: what business tables reference. */
  memberId: string
  organizationId: string
  role: OrganizationRole
  permissions: ReadonlySet<Permission>
}

export const permissionsOf = (role: OrganizationRole): ReadonlySet<Permission> =>
  new Set(ROLE_PERMISSIONS[role])

/** Pure access decision, deny by default. The tenant is guaranteed by withTenant and RLS. */
export const can = (actor: Actor, permission: Permission): boolean =>
  actor.permissions.has(permission)

/** Like `can`, but throws FORBIDDEN. Called at the start of every use case. */
export function authorize(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw new DomainError('FORBIDDEN', `Not allowed: ${permission}`, [
      { code: 'MISSING_PERMISSION', path: permission },
    ])
  }
}
