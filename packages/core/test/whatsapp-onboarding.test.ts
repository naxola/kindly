import { describe, expect, it } from 'vitest'
import {
  allChecksAcknowledged,
  checkCountrySupport,
  getOnboardingPath,
  ONBOARDING_PATHS,
  parseCountryCodes,
  PREFLIGHT_CHECK_IDS,
} from '../src/index.ts'

describe('WhatsApp coexistence onboarding (no database)', () => {
  it('offers the three mutually exclusive ways in and only coexistence is available', () => {
    expect(ONBOARDING_PATHS.map((p) => p.id).sort()).toEqual([
      'COEXISTENCE',
      'MIGRATE_BSP',
      'NEW_ACCOUNT',
    ])
    expect(ONBOARDING_PATHS.filter((p) => p.available).map((p) => p.id)).toEqual(['COEXISTENCE'])
  })

  it('knows nothing of an id that is not one of the three', () => {
    expect(getOnboardingPath('COEXISTENCE')?.available).toBe(true)
    expect(getOnboardingPath('HACK')).toBeNull()
  })

  it('has stable, unique check ids and needs every one acknowledged', () => {
    expect(new Set(PREFLIGHT_CHECK_IDS).size).toBe(PREFLIGHT_CHECK_IDS.length)
    expect(allChecksAcknowledged([...PREFLIGHT_CHECK_IDS])).toBe(true)
    expect(allChecksAcknowledged([...PREFLIGHT_CHECK_IDS, 'extra'])).toBe(true)
    expect(allChecksAcknowledged(PREFLIGHT_CHECK_IDS.slice(1))).toBe(false)
    expect(allChecksAcknowledged([])).toBe(false)
  })

  it('reports UNKNOWN when no list is configured, rather than guessing', () => {
    expect(checkCountrySupport('ES', [])).toBe('UNKNOWN')
  })

  it('matches the configured codes case-insensitively', () => {
    expect(checkCountrySupport(' ru ', ['RU', 'IR'])).toBe('UNSUPPORTED')
    expect(checkCountrySupport('ES', ['RU', 'IR'])).toBe('SUPPORTED')
  })

  it('parses the configured list, empty by default', () => {
    expect(parseCountryCodes(undefined)).toEqual([])
    expect(parseCountryCodes(' ru, ir ,,')).toEqual(['RU', 'IR'])
  })
})
