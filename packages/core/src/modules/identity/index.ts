// Identity (ADR 0003): the only module of core that may read the access tables (auth_*).
export { PERMISSIONS, ROLE_PERMISSIONS, isPermission } from './permissions.ts'
export type { Permission } from './permissions.ts'
export { can, authorize, permissionsOf } from './authorization.ts'
export type { Actor } from './authorization.ts'
export {
  ensureUser,
  findUserByAuthId,
  listMyOrganizations,
  updateProfile,
  UpdateProfileInput,
} from './users.ts'
export {
  CreateOrganizationInput,
  createOrganization,
  UpdateOrganizationInput,
  updateOrganization,
  archiveOrganization,
} from './organizations.ts'
export { resolveActor } from './actor.ts'
export { ListActivityInput, listActivity } from './activity.ts'
export type { ActivityEntry } from './activity.ts'
export {
  ChangeRoleInput,
  listMembers,
  changeMemberRole,
  disableMember,
  enableMember,
  leaveOrganization,
  organizationAdmins,
} from './members.ts'
export {
  verificationEmailJob,
  changeEmailConfirmationEmailJob,
  passwordResetEmailJob,
  invitationEmailJob,
  identityEmailHandlers,
} from './jobs.ts'
export {
  verificationEmail,
  passwordResetEmail,
  changeEmailConfirmationEmail,
  invitationEmail,
} from './emails.ts'
export {
  INVITATION_TTL_DAYS,
  invitationUrl,
  CreateInvitationInput,
  createInvitation,
  revokeInvitation,
  resendInvitation,
  listPendingInvitations,
  getInvitationByToken,
  acceptInvitation,
} from './invitations.ts'
export type { InvitationStatus, InvitationView } from './invitations.ts'
export {
  ACCOUNT_DELETION_GRACE_DAYS,
  IDENTITY_SCHEDULES,
  accountDeletionEmailJob,
  accountDeletionState,
  cancelAccountDeletion,
  exportPersonalData,
  previewAccountDeletion,
  processAccountDeletions,
  processAccountDeletionsJob,
  requestAccountDeletion,
} from './account-deletion.ts'
export type { AccountDeletionState, DeletionBlocker } from './account-deletion.ts'
export { accountDeletionEmail } from './emails.ts'
