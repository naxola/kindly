import { messagingRegistryFromEnv } from '@saas/adapters/messaging'
import { loadMessagingEnv } from '@saas/config/env'
import { parseCountryCodes, type MessagingRegistry } from '@saas/core'

let registry: MessagingRegistry | undefined

/** The messaging adapters of this process (none in production until a real channel ships). */
export const messaging = (): MessagingRegistry => (registry ??= messagingRegistryFromEnv())

/** Tests only: replaces the adapters, e.g. with a fake channel. */
export const setMessagingForTests = (next: MessagingRegistry | undefined) => {
  registry = next
}

/**
 * Countries where coexistence is not offered, from configuration. Empty (the default) means "cannot
 * check": the list is never guessed (docs/DECISIONS.md, 2026-09-19).
 */
export const unsupportedCountryCodes = (): string[] =>
  parseCountryCodes(loadMessagingEnv().WHATSAPP_UNSUPPORTED_COUNTRY_CODES)
