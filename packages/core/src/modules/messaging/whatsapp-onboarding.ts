/**
 * Pure onboarding rules for WhatsApp coexistence (the paths, what must be acknowledged, the
 * country check). Only ids and structure: the copy shown on screen lives in the web messages. Every
 * fact behind them comes from docs/INTEGRATIONS.md §2.2, which comes from Meta's documentation:
 * a requirement that cannot be sourced does not belong on a screen that tells someone what will
 * happen to their phone.
 */

export type OnboardingPathId = 'COEXISTENCE' | 'NEW_ACCOUNT' | 'MIGRATE_BSP'

export interface OnboardingPath {
  id: OnboardingPathId
  /**
   * False when Kindly has not decided or built that path. Shown as unavailable rather than hidden:
   * the delegate should know the option exists and is not ready, not wonder whether they missed it.
   */
  available: boolean
}

/**
 * The three mutually exclusive ways into WhatsApp. Only coexistence is decided (docs/DECISIONS.md,
 * 2026-09-19); the other two are real Meta flows Kindly has not adopted.
 */
export const ONBOARDING_PATHS: readonly OnboardingPath[] = [
  { id: 'COEXISTENCE', available: true },
  { id: 'NEW_ACCOUNT', available: false },
  { id: 'MIGRATE_BSP', available: false },
]

export const getOnboardingPath = (id: string): OnboardingPath | null =>
  ONBOARDING_PATHS.find((p) => p.id === id) ?? null

/**
 * What the delegate acknowledges before connecting. Not Kindly's terms: each one is a Meta
 * requirement or a real consequence for the phone in their pocket. The server re-validates the ids.
 */
export const PREFLIGHT_CHECK_IDS = [
  'business-app',
  'not-on-cloud-api',
  'business-manager',
  'history',
  'disabled-features',
  'cost',
] as const
export type PreflightCheckId = (typeof PREFLIGHT_CHECK_IDS)[number]

/** Whether every required acknowledgement is present (extra, unknown ids are ignored). */
export const allChecksAcknowledged = (acknowledged: readonly string[]): boolean =>
  PREFLIGHT_CHECK_IDS.every((id) => acknowledged.includes(id))

export type CountryCheckStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN'

/**
 * Checks the number's country against the configured list of regions where coexistence is not
 * offered. UNKNOWN when no list is configured, and that is the default: the official enumeration
 * could not be confirmed (docs/DECISIONS.md, 2026-09-19) and a list copied from a blog post would
 * block real users with false confidence. Kindly says it cannot check rather than guessing; the
 * deployment fills the list (`WHATSAPP_UNSUPPORTED_COUNTRY_CODES`) once the official source is at
 * hand.
 */
export function checkCountrySupport(
  countryCode: string,
  unsupportedCodes: readonly string[],
): CountryCheckStatus {
  if (unsupportedCodes.length === 0) return 'UNKNOWN'
  return unsupportedCodes.includes(countryCode.trim().toUpperCase()) ? 'UNSUPPORTED' : 'SUPPORTED'
}

/** Parses the configured comma-separated list; empty by default. */
export const parseCountryCodes = (csv: string | undefined): string[] =>
  (csv ?? '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
