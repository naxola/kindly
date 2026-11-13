import { randomUUID } from 'node:crypto'
import type { Conversation, MessagingAccount } from '@saas/database'
import type {
  ConnectAccountInput,
  ConnectionResult,
  ConnectionStatus,
  MessagingAdapter,
  MessagingChannelCapabilities,
  NormalizedInboundEvent,
  OutboundMessage,
  SendResult,
} from '../port.ts'

/**
 * Test double of `MessagingAdapter`, used by tests and, only when a variable that only the E2E
 * configuration sets is on, by a real server; never registered in a real deployment.
 *
 * Signature scheme: a shared secret compared verbatim against the `x-fake-signature` header. Real
 * providers use an HMAC over the raw body; this only proves that the pipeline validates BEFORE
 * persisting and rejects AFTER.
 */
export interface FakeAdapterOptions extends Partial<MessagingChannelCapabilities> {
  /** Another channel name, so one run can hold several fakes with different capabilities. */
  channel?: string
}

type RawEvent = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : null)

export class FakeMessagingAdapter implements MessagingAdapter {
  readonly channel: string
  readonly capabilities: MessagingChannelCapabilities
  private readonly secret: string
  sentMessages: {
    account: MessagingAccount
    conversation: Conversation
    message: OutboundMessage
  }[] = []
  /** Forces the id the next `sendMessage` returns, to make an echo collide with a sent message. */
  nextExternalMessageId: string | null = null
  /** Set by a test to exercise the failure path of a connection attempt. */
  failNextConnect: string | null = null
  typingSignals: { conversationId: string; replyToExternalMessageId: string }[] = []
  /** A test sets it to give this channel a subscription handshake. */
  verifyWebhookChallenge?: (query: URLSearchParams) => string | null

  constructor(secret = 'fake-shared-secret', options: FakeAdapterOptions = {}) {
    this.secret = secret
    this.channel = options.channel ?? 'fake'
    this.capabilities = {
      serviceWindowHours: options.serviceWindowHours ?? null,
      canDisconnect: options.canDisconnect ?? true,
      onboarding: options.onboarding ?? 'DIRECT',
    }
  }

  connectAccount(input: ConnectAccountInput): Promise<ConnectionResult> {
    if (this.failNextConnect) {
      const reason = this.failNextConnect
      this.failNextConnect = null
      return Promise.reject(new Error(reason))
    }
    return Promise.resolve({
      externalAccountId: `fake-account-${randomUUID()}`,
      displayName: `Fake account for ${input.delegateId}`,
      credentialsReference: 'fake-secret-store://not-a-real-secret',
    })
  }

  disconnectAccount(): Promise<void> {
    return Promise.resolve()
  }

  getConnectionStatus(): Promise<ConnectionStatus> {
    return Promise.resolve({ status: 'CONNECTED' })
  }

  sendMessage(
    account: MessagingAccount,
    conversation: Conversation,
    message: OutboundMessage,
  ): Promise<SendResult> {
    this.sentMessages.push({ account, conversation, message })
    const externalMessageId = this.nextExternalMessageId ?? `fake-outbound-${randomUUID()}`
    this.nextExternalMessageId = null
    return Promise.resolve({ externalMessageId, deliveryStatus: 'SENT' })
  }

  sendTypingIndicator(
    _account: MessagingAccount,
    conversation: Conversation,
    replyToExternalMessageId: string,
  ): Promise<void> {
    this.typingSignals.push({ conversationId: conversation.id, replyToExternalMessageId })
    return Promise.resolve()
  }

  verifyWebhookSignature(_rawBody: string, headers: Record<string, string>): boolean {
    return headers['x-fake-signature'] === this.secret
  }

  parseWebhookEvents(rawBody: string): NormalizedInboundEvent[] {
    const payload = JSON.parse(rawBody) as unknown
    const raw = (Array.isArray(payload) ? payload : [payload]) as RawEvent[]
    return raw.map((e): NormalizedInboundEvent => {
      const occurredAt = typeof e.occurredAt === 'string' ? new Date(e.occurredAt) : new Date()
      const message = () => ({
        externalConversationId: String(e.externalConversationId),
        externalMessageId: String(e.externalMessageId),
        externalContactId: String(e.externalContactId),
        contactDisplayName: str(e.contactDisplayName),
        contactPhone: str(e.contactPhone),
        text: String(e.text),
        occurredAt,
      })
      switch (e.kind) {
        case 'HISTORY_MESSAGE':
          return {
            kind: 'HISTORY_MESSAGE',
            ...message(),
            direction: e.direction === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
          }
        case 'OUTBOUND_ECHO':
          return { kind: 'OUTBOUND_ECHO', ...message() }
        case 'ACCOUNT_DISCONNECTED':
          return { kind: 'ACCOUNT_DISCONNECTED', reason: str(e.reason), occurredAt }
        case 'DELIVERY_UPDATE':
          return {
            kind: 'DELIVERY_UPDATE',
            externalMessageId: String(e.externalMessageId),
            deliveryStatus: e.deliveryStatus as 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
            occurredAt,
          }
        default:
          return { kind: 'MESSAGE', ...message() }
      }
    })
  }

  signatureHeaders(): Record<string, string> {
    return { 'x-fake-signature': this.secret }
  }
}
