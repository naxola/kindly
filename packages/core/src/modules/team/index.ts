// Team (Kindly, D14/D15): the person's data inside an organization and their position.
// Access (auth_*) and the access role belong to identity; this module only adds the profile.
export {
  PersonFields,
  MemberProfileInput,
  MyProfileInput,
  InvitationProfileInput,
  CreatePositionInput,
  UpdatePositionInput,
} from './schemas.ts'
export {
  DEFAULT_POSITIONS,
  listPositions,
  createPosition,
  updatePosition,
  setPositionArchived,
} from './positions.ts'
export {
  listTeam,
  updateMemberProfile,
  updateMyProfile,
  fullName,
  displayNamesOf,
} from './profiles.ts'
export type { TeamMember } from './profiles.ts'
export {
  createOrganizationWithTeam,
  inviteMember,
  acceptInvitationWithProfile,
  listTeamInvitations,
} from './onboarding.ts'
