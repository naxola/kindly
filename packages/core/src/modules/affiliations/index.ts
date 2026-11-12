// Affiliation of a contact (Kindly CRM): periods of membership of the organization, kept as history.
export { isFeeOverdue, firstUnpaidMonth } from './domain.ts'
export type { AffiliationFeeInput } from './domain.ts'
export { AffiliationInput } from './schemas.ts'
export {
  getCurrentAffiliation,
  listAffiliationHistory,
  createAffiliation,
  updateAffiliation,
  endAffiliation,
} from './service.ts'
export type { AffiliationView } from './service.ts'
