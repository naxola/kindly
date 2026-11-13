// Messaging (Kindly): channel accounts, the adapter port and the inbound webhook pipeline.
export type {
  ConnectAccountInput,
  ConnectionResult,
  ConnectionStatus,
  AccountStatusValue,
  OutboundMessage,
  SendResult,
  NormalizedInboundEvent,
  NormalizedInboundMessage,
  NormalizedOutboundEcho,
  NormalizedHistoryMessage,
  NormalizedAccountDisconnected,
  NormalizedDeliveryUpdate,
  MessagingChannelCapabilities,
  MessagingOnboardingKind,
  MessagingAdapter,
  MessagingRegistry,
} from './port.ts'
export { createMessagingRegistry } from './port.ts'
export { describeAccountStatus } from './domain.ts'
export type { AccountStatusDescriptor, AccountStatusTone } from './domain.ts'
export {
  listMessagingAccounts,
  connectMessagingAccount,
  disconnectMessagingAccount,
} from './accounts.ts'
export type { MessagingAccountView } from './accounts.ts'
export { sendMessage, getConversationServiceWindow, SendMessageInput } from './send.ts'
export {
  ONBOARDING_PATHS,
  PREFLIGHT_CHECK_IDS,
  getOnboardingPath,
  allChecksAcknowledged,
  checkCountrySupport,
  parseCountryCodes,
} from './whatsapp-onboarding.ts'
export type {
  OnboardingPath,
  OnboardingPathId,
  PreflightCheckId,
  CountryCheckStatus,
} from './whatsapp-onboarding.ts'
export {
  processWebhookJob,
  processWebhookHandler,
  processWebhookEvent,
  receiveWebhook,
  verifyWebhookSubscription,
} from './webhooks.ts'
export type { WebhookOutcome, ReceiveDeps, ProcessDeps } from './webhooks.ts'
export { FakeMessagingAdapter } from './testing/fake-adapter.ts'
export type { FakeAdapterOptions } from './testing/fake-adapter.ts'
