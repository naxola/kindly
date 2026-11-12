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
  // Kindly (team): positions catalog and any member's profile. Editing one's own is free.
  'positions.manage',
  'member_profiles.manage',
  // Kindly (CRM). Reading and writing contacts is limited by visibility; reading all and
  // reassigning the reference delegate are for administrators.
  'contacts.read',
  'contacts.write',
  'contacts.read_all',
  'contacts.assign',
  'affiliations.manage',
  // Kindly (tasks): visible when they have no contact or the contact is visible.
  'tasks.read',
  'tasks.write',
  'billing.read',
  'billing.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MEMBER: [
    'organization.read',
    'members.read',
    'contacts.read',
    'contacts.write',
    'affiliations.manage',
    'tasks.read',
    'tasks.write',
  ],
}

export const isPermission = (value: string): value is Permission =>
  (PERMISSIONS as readonly string[]).includes(value)
