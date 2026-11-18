import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  bodyForAttachment,
  limitStream,
  MAX_MEDIA_BYTES,
  MediaTooLargeError,
  MediaUnavailableError,
  type AttachmentKind,
  type ConnectionResult,
  type ConnectionStatus,
  type MediaDownload,
  type MessageAttachment,
  type MessagingAdapter,
  type MessagingChannelCapabilities,
  type NormalizedInboundEvent,
  type OutboundMessage,
  type SendResult,
} from '@saas/core'
import { assertPublicHost, type HostResolver } from '../knowledge/network-guard.ts'
import type { Conversation, MessagingAccount } from '@saas/database'

/**
 * WhatsApp Cloud API against Meta's free TEST number: an engineering tool to validate the real
 * `Meta webhook -> conversation -> inbox` pipeline (real payloads, real HMAC signatures) while the
 * Tech Provider paperwork runs its course.
 *
 * This is NOT coexistence and never a real connection option for a delegate: the test number is a
 * shared Cloud API number with no phone behind it, which would break product principle 1. It is
 * registered as "whatsapp-test" (never "whatsapp", reserved for the real adapter) and only when
 * `WHATSAPP_TEST_ADAPTER_ENABLED=true` outside production (packages/config).
 */
export interface WhatsAppTestAdapterConfig {
  phoneNumberId: string
  /** When set, `connectAccount` subscribes this WABA to the app's webhooks. */
  wabaId?: string | null
  accessToken: string
  appSecret: string
  verifyToken: string
  graphApiVersion?: string
  /** Injectable for unit tests: CI never makes a real network call. */
  fetchImpl?: typeof fetch
  /** Injectable for unit tests: how a media download host is resolved (SSRF guard). */
  resolveHost?: HostResolver
}

const DEFAULT_GRAPH_API_VERSION = 'v25.0'

const STATUS_MAP: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
}

interface MetaMedia {
  id?: string
  mime_type?: string
  caption?: string
  filename?: string
}

interface MetaMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body?: string }
  image?: MetaMedia
  document?: MetaMedia
  audio?: MetaMedia
  video?: MetaMedia
  sticker?: MetaMedia
}

const MEDIA_TYPES: Record<string, AttachmentKind> = {
  image: 'IMAGE',
  document: 'DOCUMENT',
  audio: 'AUDIO',
  video: 'VIDEO',
  sticker: 'STICKER',
}

/** An error from Meta's Graph API with its HTTP status, so a caller can tell "gone" from "broken". */
class GraphApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'GraphApiError'
  }
}

/** The descriptor of an inbound media message, or null for any other type (or one without an id). */
function readMedia(
  message: MetaMessage,
): { attachment: MessageAttachment; caption: string | null } | null {
  const kind = MEDIA_TYPES[message.type]
  const media = kind
    ? (message as unknown as Record<string, MetaMedia | undefined>)[message.type]
    : undefined
  if (!kind || !media?.id) return null
  return {
    attachment: {
      kind,
      mediaId: media.id,
      mimeType: media.mime_type ?? null,
      filename: kind === 'DOCUMENT' ? (media.filename ?? null) : null,
    },
    caption: media.caption ?? null,
  }
}

interface MetaStatus {
  id: string
  status: string
  timestamp: string
}

interface MetaChangeValue {
  metadata?: { phone_number_id?: string }
  contacts?: { wa_id?: string; profile?: { name?: string } }[]
  messages?: MetaMessage[]
  statuses?: MetaStatus[]
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a, 'utf8')
  const y = Buffer.from(b, 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export class WhatsAppTestAdapter implements MessagingAdapter {
  readonly channel = 'whatsapp-test'
  readonly capabilities: MessagingChannelCapabilities = {
    serviceWindowHours: 24,
    canDisconnect: true,
    onboarding: 'DIRECT',
    // "Media IDs in webhooks expire after 7 days" (Cloud API media reference; to confirm against
    // the current documentation and a real file in staging before production).
    inboundMediaDays: 7,
  }
  private readonly config: WhatsAppTestAdapterConfig
  private readonly fetchImpl: typeof fetch

  constructor(config: WhatsAppTestAdapterConfig) {
    this.config = config
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  private graphUrl(path: string) {
    return `https://graph.facebook.com/${this.config.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION}/${path}`
  }

  private async graphRequest(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown },
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(this.graphUrl(path), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    })
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) {
      // Only Meta's error message, never the request (it carries the token).
      const error = payload.error as { message?: string } | undefined
      throw new GraphApiError(
        `Meta Graph API ${response.status}: ${error?.message ?? 'unknown error'}`,
        response.status,
      )
    }
    return payload
  }

  /**
   * No OAuth: the credentials were obtained by hand in Meta's dashboard and live in the
   * environment. It still calls Meta, so a wrong token or phone number id fails here, at connection
   * time, and not silently at the first send.
   */
  async connectAccount(): Promise<ConnectionResult> {
    const phone = await this.graphRequest(
      `${this.config.phoneNumberId}?fields=display_phone_number,verified_name`,
      { method: 'GET' },
    )
    if (this.config.wabaId) {
      // Idempotent on Meta's side. Without it the callback URL can pass verification and still
      // never receive a single event.
      await this.graphRequest(`${this.config.wabaId}/subscribed_apps`, { method: 'POST' })
    }
    const display =
      typeof phone.display_phone_number === 'string' ? phone.display_phone_number : null
    return {
      externalAccountId: this.config.phoneNumberId,
      externalBusinessAccountId: this.config.wabaId ?? null,
      phone: display ? `+${display.replace(/\D/g, '')}` : null,
      displayName:
        typeof phone.verified_name === 'string'
          ? `${phone.verified_name} (Meta test number)`
          : 'Meta test number',
      credentialsReference: 'env://WHATSAPP_TEST_ACCESS_TOKEN',
    }
  }

  disconnectAccount(): Promise<void> {
    // Kindly side only. Deregistering Meta's shared test number would break it for the whole app,
    // and it is not ours to deregister.
    return Promise.resolve()
  }

  getConnectionStatus(): Promise<ConnectionStatus> {
    return Promise.resolve({ status: 'CONNECTED' })
  }

  async sendMessage(
    _account: MessagingAccount,
    conversation: Conversation,
    message: OutboundMessage,
  ): Promise<SendResult> {
    try {
      const payload = await this.graphRequest(`${this.config.phoneNumberId}/messages`, {
        method: 'POST',
        body: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          // A 1:1 chat is keyed by the contact's wa_id (see parseWebhookEvents).
          to: conversation.externalConversationId,
          type: 'text',
          text: { body: message.text },
        },
      })
      const sent = (payload.messages as { id?: string }[] | undefined)?.[0]
      if (!sent?.id) throw new Error('Meta Graph API returned no message id.')
      return { externalMessageId: sent.id, deliveryStatus: 'SENT' }
    } catch (error) {
      // A rejected send (closed window, unverified recipient) is a FAILED message in the thread, not
      // an exception, so it is visible where the delegate wrote it. The id is synthetic: Meta never
      // assigned one.
      return {
        externalMessageId: `failed-${randomUUID()}`,
        deliveryStatus: 'FAILED',
        failureReason: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Meta's typing indicator: shown for up to 25 s or until the reply arrives, and in the same call
   * it marks the contact's message as read.
   * https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators
   */
  async sendTypingIndicator(
    _account: MessagingAccount,
    _conversation: Conversation,
    replyToExternalMessageId: string,
  ): Promise<void> {
    await this.graphRequest(`${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: replyToExternalMessageId,
        typing_indicator: { type: 'text' },
      },
    })
  }

  /** HMAC-SHA256 of the raw body with the App Secret, as Meta sends it in `X-Hub-Signature-256`. */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    const header = headers['x-hub-signature-256']
    if (!header?.startsWith('sha256=')) return false
    const expected = createHmac('sha256', this.config.appSecret)
      .update(rawBody, 'utf8')
      .digest('hex')
    return safeEqual(expected, header.slice('sha256='.length))
  }

  /** Meta's subscription handshake (`GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`). */
  verifyWebhookChallenge(query: URLSearchParams): string | null {
    const challenge = query.get('hub.challenge')
    if (query.get('hub.mode') !== 'subscribe' || !challenge) return null
    return safeEqual(this.config.verifyToken, query.get('hub.verify_token') ?? '')
      ? challenge
      : null
  }

  /**
   * Opens an inbound file at Meta and returns its bytes as a stream, for the download proxy. Two
   * steps, as Meta documents: `GET /{media-id}` returns a short-lived URL, which is then fetched with
   * the same bearer token. The bytes are only piped through.
   */
  async downloadMedia(
    _account: MessagingAccount,
    attachment: MessageAttachment,
  ): Promise<MediaDownload> {
    let meta: Record<string, unknown>
    try {
      meta = await this.graphRequest(encodeURIComponent(attachment.mediaId), { method: 'GET' })
    } catch (error) {
      // An expired or unknown media id answers 404, or 400 "Object ... does not exist".
      if (
        error instanceof GraphApiError &&
        (error.status === 404 ||
          (error.status === 400 && /does not exist|expired/i.test(error.message)))
      ) {
        throw new MediaUnavailableError()
      }
      throw error
    }
    const url = typeof meta.url === 'string' ? new URL(meta.url) : null
    if (!url || url.protocol !== 'https:') {
      throw new Error('Meta returned no usable download address.')
    }
    // The address comes from Meta's response: never let it point at our own network.
    await assertPublicHost(url, this.config.resolveHost)
    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${this.config.accessToken}` },
      redirect: 'manual',
    })
    if (response.status === 404 || response.status === 410) throw new MediaUnavailableError()
    if (!response.ok || !response.body) {
      throw new Error(`Meta media download failed with status ${response.status}.`)
    }
    const length = Number(response.headers.get('content-length'))
    const contentLength = Number.isFinite(length) && length > 0 ? length : null
    if (contentLength !== null && contentLength > MAX_MEDIA_BYTES) {
      await response.body.cancel()
      throw new MediaTooLargeError(MAX_MEDIA_BYTES)
    }
    return {
      body: limitStream(response.body, MAX_MEDIA_BYTES),
      contentType:
        response.headers.get('content-type') ??
        (typeof meta.mime_type === 'string' ? meta.mime_type : null),
      contentLength,
    }
  }

  parseWebhookEvents(rawBody: string): NormalizedInboundEvent[] {
    const payload = JSON.parse(rawBody) as {
      object?: string
      entry?: { changes?: { field?: string; value?: MetaChangeValue }[] }[]
    }
    if (payload.object !== 'whatsapp_business_account') return []

    const events: NormalizedInboundEvent[] = []
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        // One app callback receives every number of every subscribed WABA: anything not addressed
        // to this number is not ours to ingest.
        if (
          change.field !== 'messages' ||
          !value ||
          value.metadata?.phone_number_id !== this.config.phoneNumberId
        ) {
          continue
        }
        for (const message of value.messages ?? []) {
          const contact = value.contacts?.find((c) => c.wa_id === message.from)
          const media = readMedia(message)
          events.push({
            kind: 'MESSAGE',
            // WhatsApp has no conversation id: a 1:1 chat is identified by the contact's wa_id.
            externalConversationId: message.from,
            externalMessageId: message.id,
            externalContactId: message.from,
            contactDisplayName: contact?.profile?.name ?? null,
            contactPhone: `+${message.from}`,
            text: media
              ? bodyForAttachment(media.caption, media.attachment)
              : message.type === 'text'
                ? (message.text?.body ?? '')
                : `[Message of type "${message.type}": Kindly does not display this content yet]`,
            attachment: media?.attachment ?? null,
            occurredAt: new Date(Number(message.timestamp) * 1000),
          })
        }
        for (const status of value.statuses ?? []) {
          const deliveryStatus = STATUS_MAP[status.status]
          if (!deliveryStatus) continue
          events.push({
            kind: 'DELIVERY_UPDATE',
            externalMessageId: status.id,
            deliveryStatus,
            occurredAt: new Date(Number(status.timestamp) * 1000),
          })
        }
      }
    }
    return events
  }
}
