import type { OrganizationRole } from '@saas/database'

/**
 * Permission catalog of the template. Each product adds its own permissions here and
 * assigns them to roles in ROLE_PERMISSIONS. Deny by default: a permission not listed
 * for a role is not granted.
 */
export const PERMISSIONS = [
  'organization.read',
  'organization.update',
  'members.read',
  'members.invite',
  'members.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MEMBER: ['organization.read', 'members.read'],
}

export const isPermission = (value: string): value is Permission =>
  (PERMISSIONS as readonly string[]).includes(value)
