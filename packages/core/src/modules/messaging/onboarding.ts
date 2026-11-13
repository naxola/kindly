import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { authorize } from '../identity/index.ts'
import { connectAccount, type MessagingAccountView } from './accounts.ts'
import type { MessagingRegistry } from './port.ts'
import {
  allChecksAcknowledged,
  checkCountrySupport,
  getOnboardingPath,
  PREFLIGHT_CHECK_IDS,
} from './whatsapp-onboarding.ts'

export const OnboardingInput = z.object({
  channel: z.string().trim().min(1).max(60),
  path: z.string().trim().min(1).max(40),
  acknowledged: z.array(z.string().max(60)).max(20).default([]),
  countryCode: z.string().trim().max(2).nullish(),
})
export type OnboardingInput = z.input<typeof OnboardingInput>

/**
 * Connects a channel that needs the guided onboarding (WhatsApp coexistence). The rules are enforced
 * here and not left to the form: the acknowledgements are about someone's phone losing features, so
 * "the button was disabled" is a courtesy, not a guarantee.
 *
 * - the channel must declare that onboarding (never a provider name);
 * - only an available path can be taken (today: coexistence);
 * - every acknowledgement must be present (extra ids are ignored);
 * - with a list of unsupported countries configured the country is required and checked; with none,
 *   Kindly says it cannot check and lets the provider decide (the list is never guessed).
 */
export async function connectWithOnboarding(
  ctx: Ctx,
  registry: MessagingRegistry,
  input: OnboardingInput,
  options: { unsupportedCountryCodes: readonly string[] },
): Promise<MessagingAccountView> {
  authorize(ctx.actor, 'channels.connect')
  const data = OnboardingInput.parse(input)
  const adapter = registry.get(data.channel)
  if (!adapter || adapter.capabilities.onboarding !== 'WHATSAPP_COEXISTENCE') {
    throw new DomainError('VALIDATION_FAILED', 'This channel has no guided onboarding', [
      { path: 'channel', code: 'UNKNOWN_CHANNEL' },
    ])
  }
  const path = getOnboardingPath(data.path)
  if (!path) {
    throw new DomainError('VALIDATION_FAILED', 'Unknown path', [
      { path: 'path', code: 'UNKNOWN_PATH' },
    ])
  }
  if (!path.available) {
    throw new DomainError('CONFLICT', 'That path is not available yet', [
      { code: 'PATH_UNAVAILABLE' },
    ])
  }
  if (!allChecksAcknowledged(data.acknowledged)) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'Every point must be acknowledged before connecting',
      PREFLIGHT_CHECK_IDS.filter((id) => !data.acknowledged.includes(id)).map((id) => ({
        path: 'acknowledged',
        code: 'PREFLIGHT_INCOMPLETE',
        id,
      })),
    )
  }
  let countryCode: string | null = null
  if (options.unsupportedCountryCodes.length > 0) {
    countryCode = data.countryCode?.toUpperCase() ?? null
    if (!countryCode || countryCode.length !== 2) {
      throw new DomainError('VALIDATION_FAILED', 'The number’s country is required', [
        { path: 'countryCode', code: 'COUNTRY_REQUIRED' },
      ])
    }
    if (checkCountrySupport(countryCode, options.unsupportedCountryCodes) === 'UNSUPPORTED') {
      throw new DomainError('CONFLICT', 'Coexistence is not offered in that country', [
        { code: 'COUNTRY_UNSUPPORTED' },
      ])
    }
  }
  return connectAccount(ctx, registry, {
    channel: data.channel,
    authorizationPayload: { onboarding: 'WHATSAPP_COEXISTENCE', countryCode },
  })
}
