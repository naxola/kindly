import {
  createMessagingRegistry,
  FakeMessagingAdapter,
  type MessagingAdapter,
  type MessagingRegistry,
} from '@saas/core'

export interface MessagingRegistryOptions {
  /**
   * Registers the fake channel (signature = a shared secret). Only the E2E configuration turns it
   * on; a real deployment never does.
   */
  fake?: { secret: string }
}

/**
 * The messaging adapters this process has. The real ones (WhatsApp, Telegram) are added here as
 * they ship; until then production has none and every webhook answers 404.
 */
export function buildMessagingRegistry(options: MessagingRegistryOptions = {}): MessagingRegistry {
  const adapters: MessagingAdapter[] = []
  if (options.fake) adapters.push(new FakeMessagingAdapter(options.fake.secret))
  return createMessagingRegistry(adapters)
}
