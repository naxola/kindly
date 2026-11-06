// Identity (ADR 0003): the only module of core that may read the access tables (auth_*).
export { PERMISSIONS, ROLE_PERMISSIONS, isPermission } from './permissions.ts'
export type { Permission } from './permissions.ts'
export { can, authorize, permissionsOf } from './authorization.ts'
export type { Actor } from './authorization.ts'
export { ensureUser, findUserByAuthId, listMyOrganizations } from './users.ts'
export { CreateOrganizationInput, createOrganization } from './organizations.ts'
export { resolveActor } from './actor.ts'
export { ChangeRoleInput, listMembers, changeMemberRole, disableMember } from './members.ts'
export {
  verificationEmailJob,
  passwordResetEmailJob,
  invitationEmailJob,
  identityEmailHandlers,
} from './jobs.ts'
export { verificationEmail, passwordResetEmail, invitationEmail } from './emails.ts'
export {
  INVITATION_TTL_DAYS,
  invitationUrl,
  CreateInvitationInput,
  createInvitation,
  revokeInvitation,
  listPendingInvitations,
  getInvitationByToken,
  acceptInvitation,
} from './invitations.ts'
export type { InvitationStatus, InvitationView } from './invitations.ts'
