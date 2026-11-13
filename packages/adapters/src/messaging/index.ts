import {
  createMessagingRegistry,
  FakeMessagingAdapter,
  type MessagingAdapter,
  type MessagingRegistry,
} from '@saas/core'
import { loadMessagingEnv } from '@saas/config/env'
import { WhatsAppTestAdapter, type WhatsAppTestAdapterConfig } from './whatsapp-test.ts'

export { WhatsAppTestAdapter } from './whatsapp-test.ts'
export type { WhatsAppTestAdapterConfig } from './whatsapp-test.ts'

export interface MessagingRegistryOptions {
  /**
   * Registers the fake channel (signature = a shared secret). Only the E2E configuration turns it
   * on; a real deployment never does.
   */
  fake?: { secret: string }
  /** Meta's test number (never in production, see packages/config). */
  whatsappTest?: WhatsAppTestAdapterConfig
}

/**
 * The messaging adapters this process has. The real ones (WhatsApp coexistence, Telegram) are added
 * here as they ship; until then production has none and every webhook answers 404.
 */
export function buildMessagingRegistry(options: MessagingRegistryOptions = {}): MessagingRegistry {
  const adapters: MessagingAdapter[] = []
  if (options.fake) adapters.push(new FakeMessagingAdapter(options.fake.secret))
  if (options.whatsappTest) adapters.push(new WhatsAppTestAdapter(options.whatsappTest))
  return createMessagingRegistry(adapters)
}

/** The registry the environment asks for (nothing configured: empty). Fails loudly on a bad config. */
export function messagingRegistryFromEnv(
  source: Record<string, string | undefined> = process.env,
): MessagingRegistry {
  const env = loadMessagingEnv(source)
  return buildMessagingRegistry({
    ...(env.E2E_FAKE_MESSAGING_SECRET ? { fake: { secret: env.E2E_FAKE_MESSAGING_SECRET } } : {}),
    ...(env.WHATSAPP_TEST_ADAPTER_ENABLED
      ? {
          whatsappTest: {
            phoneNumberId: env.WHATSAPP_TEST_PHONE_NUMBER_ID!,
            wabaId: env.WHATSAPP_TEST_WABA_ID ?? null,
            accessToken: env.WHATSAPP_TEST_ACCESS_TOKEN!,
            appSecret: env.WHATSAPP_TEST_APP_SECRET!,
            verifyToken: env.WHATSAPP_TEST_VERIFY_TOKEN!,
          },
        }
      : {}),
  })
}
