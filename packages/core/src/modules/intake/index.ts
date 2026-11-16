// Altas of affiliates from an automation (Kindly, ported from the previous app): reception with an
// integration key, delegate proposal by load and the administrator's decision.
export {
  normalizeAffiliatePayload,
  normalizeDni,
  isDniShape,
  normalizeSpanishPhone,
  parseBirthDate,
  parseFeeCents,
  toDisplayCase,
} from './normalize.ts'
export type { NormalizedAffiliate, NormalizeResult } from './normalize.ts'
export { proposeDelegate, totalLoad } from './proposal.ts'
export type { DelegateLoad } from './proposal.ts'
export {
  AFFILIATE_INTAKE_PURPOSE,
  CreateIntegrationKeyInput,
  createIntegrationKey,
  listIntegrationKeys,
  revokeIntegrationKey,
  authenticateIntegrationKey,
} from './keys.ts'
export type { IntegrationKeyView } from './keys.ts'
export {
  ConfirmAffiliateRequestInput,
  receiveAffiliateAlta,
  listOpenAffiliateRequests,
  countOpenAffiliateRequests,
  confirmAffiliateRequest,
  confirmAllAffiliateRequests,
  discardAffiliateRequest,
  applyDuplicateAffiliateRequest,
} from './requests.ts'
export type { IntakeItemResult, AffiliateRequestView, OpenAffiliateRequests } from './requests.ts'
