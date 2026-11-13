import { messagingRegistryFromEnv } from '@saas/adapters/messaging'
import type { MessagingRegistry } from '@saas/core'

let registry: MessagingRegistry | undefined

/** The messaging adapters of this process (none in production until a real channel ships). */
export const messaging = (): MessagingRegistry => (registry ??= messagingRegistryFromEnv())

/** Tests only: replaces the adapters, e.g. with a fake channel. */
export const setMessagingForTests = (next: MessagingRegistry | undefined) => {
  registry = next
}
