import type { Conversation, MessagingAccount } from '@saas/database'

/**
 * `MessagingAdapter`: the only way the domain talks to a messaging provider (docs/ARCHITECTURE.md
 * §4). Implementations live outside core (packages/adapters); the domain never branches on a
 * provider name, only on what the adapter declares in `capabilities`.
 *
 * Refinement of the conceptual interface: a single `handleWebhook(payload)` cannot validate a
 * signature (that needs the raw body and headers, before anything is parsed) nor tell "invalid
 * signature" from "valid but unparseable". It is split into `verifyWebhookSignature` (called before
 * persisting anything) and `parseWebhookEvents` (called afterwards, asynchronously).
 */

export interface ConnectAccountInput {
  organizationId: string
  /** organization_members.id of the delegate who owns the account. */
  delegateId: string
  /** Provider-specific: an OAuth code, a bot token, a connection id... */
  authorizationPayload?: Record<string, unknown>
}

export interface ConnectionResult {
  externalAccountId: string
  externalBusinessAccountId?: string | null
  externalConnectionId?: string | null
  phone?: string | null
  displayName?: string | null
  /** Points to a secret store; never the secret. */
  credentialsReference?: string | null
  metadata?: Record<string, unknown> | null
}

export type AccountStatusValue =
  'PENDING' | 'CONNECTING' | 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'REVOKED' | 'ERROR'

export interface ConnectionStatus {
  status: AccountStatusValue
  lastError?: string | null
}

export interface OutboundMessage {
  text: string
}

export interface SendResult {
  externalMessageId: string
  deliveryStatus: 'SENT' | 'FAILED'
  failureReason?: string | null
}

/** Fields every normalized event about a message shares. */
interface MessageEventBase {
  externalConversationId: string
  externalMessageId: string
  /** Provider identity of the other side; never a phone number (docs/DATABASE.md §6). */
  externalContactId: string
  contactDisplayName?: string | null
  /** Opportunistic; never used as technical identity. */
  contactPhone?: string | null
  text: string
  occurredAt: Date
}

export interface NormalizedInboundMessage extends MessageEventBase {
  kind: 'MESSAGE'
}

/**
 * A message the delegate wrote from their own device, echoed back by the provider (WhatsApp
 * coexistence `smb_message_echoes`). Outbound, but Kindly did not originate it. It can be the first
 * thing seen of a conversation, so it carries the contact fields too.
 */
export interface NormalizedOutboundEcho extends MessageEventBase {
  kind: 'OUTBOUND_ECHO'
}

/**
 * A message from the past, replayed by the provider's initial sync after connecting. Not news: it
 * must not mark the conversation unread nor produce one activity per message.
 */
export interface NormalizedHistoryMessage extends MessageEventBase {
  kind: 'HISTORY_MESSAGE'
  /** History replays both sides of the conversation. */
  direction: 'INBOUND' | 'OUTBOUND'
}

/**
 * The connection ended outside Kindly (the delegate disconnected from their phone, the provider
 * revoked it). There is no acting user on our side.
 */
export interface NormalizedAccountDisconnected {
  kind: 'ACCOUNT_DISCONNECTED'
  reason?: string | null
  occurredAt: Date
}

export interface NormalizedDeliveryUpdate {
  kind: 'DELIVERY_UPDATE'
  externalMessageId: string
  deliveryStatus: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  occurredAt: Date
}

export type NormalizedInboundEvent =
  | NormalizedInboundMessage
  | NormalizedOutboundEcho
  | NormalizedHistoryMessage
  | NormalizedAccountDisconnected
  | NormalizedDeliveryUpdate

export type MessagingOnboardingKind = 'DIRECT' | 'WHATSAPP_COEXISTENCE'

/** What a channel can and cannot do, declared by its adapter. */
export interface MessagingChannelCapabilities {
  /**
   * Length of the provider's free-form messaging window in hours, counted from the contact's last
   * inbound message; null when the channel has none.
   */
  serviceWindowHours: number | null
  /**
   * Whether Kindly can end the connection from its side. False for WhatsApp coexistence: there is
   * no Deregister API, the delegate disconnects from their phone and a webhook tells us.
   */
  canDisconnect: boolean
  /** Which onboarding the channel needs before it can be connected. */
  onboarding: MessagingOnboardingKind
}

export interface MessagingAdapter {
  readonly channel: string
  readonly capabilities: MessagingChannelCapabilities
  connectAccount(input: ConnectAccountInput): Promise<ConnectionResult>
  disconnectAccount(account: MessagingAccount): Promise<void>
  getConnectionStatus(account: MessagingAccount): Promise<ConnectionStatus>
  sendMessage(
    account: MessagingAccount,
    conversation: Conversation,
    message: OutboundMessage,
  ): Promise<SendResult>
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
    account: MessagingAccount,
  ): boolean
  parseWebhookEvents(rawBody: string, headers: Record<string, string>): NormalizedInboundEvent[]
  /**
   * Optional subscription handshake some providers run before accepting a webhook URL (Meta's
   * `GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`). Returns the string to echo
   * back, or null to reject. Channels without one omit it.
   */
  verifyWebhookChallenge?(query: URLSearchParams): string | null
  /** Optional: show "typing..." to the contact, anchored to their latest inbound message. */
  sendTypingIndicator?(
    account: MessagingAccount,
    conversation: Conversation,
    replyToExternalMessageId: string,
  ): Promise<void>
}

/**
 * The adapters available to this process, injected by whoever runs the use case (the web app, the
 * worker, a test). There is no global registry: a process only has the adapters it was given.
 */
export interface MessagingRegistry {
  get(channel: string): MessagingAdapter | null
  channels(): string[]
}

export function createMessagingRegistry(adapters: readonly MessagingAdapter[]): MessagingRegistry {
  const byChannel = new Map(adapters.map((a) => [a.channel, a]))
  return {
    get: (channel) => byChannel.get(channel) ?? null,
    channels: () => [...byChannel.keys()],
  }
}
