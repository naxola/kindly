/**
 * `MessagingAdapter` — the only way the domain talks to a messaging
 * provider (docs/ARCHITECTURE.md sección 4). No implementation lives here:
 * `WhatsAppAdapter`/`TelegramAdapter` are Fase 4/5, gated on the Fase 0 PoC.
 *
 * This refines the conceptual interface from docs/ARCHITECTURE.md — a
 * single `handleWebhook(payload: unknown)` can't validate a signature (that
 * needs the raw body + headers, before anything is parsed) and can't
 * distinguish "invalid signature" from "valid but unparseable". Split into
 * `verifyWebhookSignature` (raw body + headers, called before persisting
 * anything) and `parseWebhookEvents` (called afterwards, during async
 * normalization). See docs/DECISIONS.md.
 */
import type { conversations, messagingAccounts } from "@/db/schema";

export type MessagingAccountRecord = typeof messagingAccounts.$inferSelect;
export type ConversationRecord = typeof conversations.$inferSelect;

export interface ConnectAccountInput {
  organizationId: string;
  delegateId: string;
  /** Provider-specific: an OAuth code, a bot token, a connection id, etc. */
  authorizationPayload?: Record<string, unknown>;
}

export interface ConnectionResult {
  externalAccountId: string;
  externalBusinessAccountId?: string | null;
  externalConnectionId?: string | null;
  phoneE164?: string | null;
  displayName?: string | null;
  credentialsReference?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type MessagingAccountStatusValue =
  | "PENDING"
  | "CONNECTING"
  | "CONNECTED"
  | "DEGRADED"
  | "DISCONNECTED"
  | "REVOKED"
  | "ERROR";

export interface ConnectionStatus {
  status: MessagingAccountStatusValue;
  lastError?: string | null;
}

export interface OutboundMessage {
  text: string;
}

export interface SendResult {
  externalMessageId: string;
  deliveryStatus: "SENT" | "FAILED";
  failureReason?: string | null;
}

export interface NormalizedInboundMessage {
  kind: "MESSAGE";
  externalConversationId: string;
  externalMessageId: string;
  /** Provider identity of the sender — never a phone number (docs/DATABASE.md sección 6). */
  externalContactId: string;
  contactDisplayName?: string | null;
  /** Opportunistic, never used as technical identity. */
  contactPhoneE164?: string | null;
  text: string;
  occurredAt: Date;
}

/**
 * A message the DELEGATE sent from their own device, echoed back to us by
 * the provider — WhatsApp coexistence's `smb_message_echoes`
 * (docs/INTEGRATIONS.md sección 2.2). It is OUTBOUND, but Kindly did not
 * originate it, which is why it can't reuse `NormalizedInboundMessage`.
 *
 * Carries the same contact fields as an inbound message on purpose: an echo
 * can be the *first* thing we ever see of a conversation, when the delegate
 * starts a brand-new chat from their phone.
 */
export interface NormalizedOutboundEcho {
  kind: "OUTBOUND_ECHO";
  externalConversationId: string;
  externalMessageId: string;
  /** Provider identity of the recipient — never a phone number (docs/DATABASE.md sección 6). */
  externalContactId: string;
  contactDisplayName?: string | null;
  /** Opportunistic, never used as technical identity. */
  contactPhoneE164?: string | null;
  text: string;
  occurredAt: Date;
}

/**
 * A message from the conversation's past, replayed by the provider during
 * the initial sync that follows a connection (WhatsApp coexistence's
 * `history` webhook, 180 days of 1:1 chats — docs/INTEGRATIONS.md sección
 * 2.2). Unlike a live message it is not news: it must not mark the
 * conversation unread, and it must not produce one Activity per message.
 */
export interface NormalizedHistoryMessage {
  kind: "HISTORY_MESSAGE";
  externalConversationId: string;
  externalMessageId: string;
  externalContactId: string;
  contactDisplayName?: string | null;
  contactPhoneE164?: string | null;
  /** History replays both sides of the conversation. */
  direction: "INBOUND" | "OUTBOUND";
  text: string;
  occurredAt: Date;
}

/**
 * The connection ended somewhere other than Kindly — the delegate
 * disconnected from their own phone, or the provider revoked it
 * (WhatsApp's `account_update` / `PARTNER_REMOVED`). There is no acting
 * user on our side, so this is the only way such a channel ever reaches
 * DISCONNECTED.
 */
export interface NormalizedAccountDisconnected {
  kind: "ACCOUNT_DISCONNECTED";
  reason?: string | null;
  occurredAt: Date;
}

export interface NormalizedDeliveryUpdate {
  kind: "DELIVERY_UPDATE";
  externalMessageId: string;
  deliveryStatus: "SENT" | "DELIVERED" | "READ" | "FAILED";
  occurredAt: Date;
}

export type NormalizedInboundEvent =
  | NormalizedInboundMessage
  | NormalizedOutboundEcho
  | NormalizedHistoryMessage
  | NormalizedAccountDisconnected
  | NormalizedDeliveryUpdate;

/**
 * What a channel can and cannot do, declared by its adapter so the domain
 * and the UI never branch on a provider name (`CLAUDE.md` sección 2: no
 * acoplar el dominio a un proveedor concreto). Both flags exist because
 * WhatsApp coexistence answers them differently from every other channel —
 * see docs/INTEGRATIONS.md sección 2.2.
 */
export interface MessagingChannelCapabilities {
  /**
   * Length of the provider's free-form messaging window, in hours, counted
   * from the Contact's last inbound message. `null` when the channel has no
   * such restriction (Telegram). WhatsApp Cloud API: 24.
   */
  serviceWindowHours: number | null;
  /**
   * Whether Kindly can end the connection from its side. False for WhatsApp
   * coexistence: there is no Deregister API, the delegate disconnects from
   * their own phone and we only find out through a webhook.
   */
  canDisconnect: boolean;
}

export interface MessagingAdapter {
  readonly channel: string;
  readonly capabilities: MessagingChannelCapabilities;
  connectAccount(input: ConnectAccountInput): Promise<ConnectionResult>;
  disconnectAccount(account: MessagingAccountRecord): Promise<void>;
  getConnectionStatus(account: MessagingAccountRecord): Promise<ConnectionStatus>;
  sendMessage(
    account: MessagingAccountRecord,
    conversation: ConversationRecord,
    message: OutboundMessage,
  ): Promise<SendResult>;
  verifyWebhookSignature(
    rawBody: string,
    headers: Record<string, string>,
    account: MessagingAccountRecord,
  ): boolean;
  parseWebhookEvents(rawBody: string, headers: Record<string, string>): NormalizedInboundEvent[];
}
