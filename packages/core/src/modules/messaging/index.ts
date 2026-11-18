// Messaging (Kindly): channel accounts, the adapter port and the inbound webhook pipeline.
export type {
  MediaDownload,
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
  listConnectableChannels,
  connectMessagingAccount,
  disconnectMessagingAccount,
} from './accounts.ts'
export type { MessagingAccountView, ConnectableChannel } from './accounts.ts'
export { connectWithOnboarding, OnboardingInput } from './onboarding.ts'
export { getConversationDetail, listThreadMessages } from './thread.ts'
export type { ConversationDetail, ThreadMessage, ThreadAttachment } from './thread.ts'
export {
  sendMessage,
  signalTyping,
  getConversationServiceWindow,
  SendMessageInput,
  TYPING_INDICATOR_THROTTLE_MS,
} from './send.ts'
export type { TypingSignalResult } from './send.ts'
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
export {
  MESSAGING_SCHEDULES,
  purgeExpiredWebhookEvents,
  purgeWebhookEventsJob,
} from './retention.ts'
export { FakeMessagingAdapter } from './testing/fake-adapter.ts'
export type { FakeAdapterOptions } from './testing/fake-adapter.ts'
export {
  ATTACHMENT_KINDS,
  MAX_MEDIA_BYTES,
  MEDIA_DOWNLOADS_PER_MINUTE,
  attachmentPlaceholder,
  bodyForAttachment,
  isMediaExpired,
  readAttachment,
  safeContentType,
  safeDownloadName,
  limitStream,
  MediaUnavailableError,
  MediaTooLargeError,
} from './attachments.ts'
export type { AttachmentKind, MessageAttachment } from './attachments.ts'
export { openMessageMedia } from './media.ts'
export type { OpenedMedia } from './media.ts'
