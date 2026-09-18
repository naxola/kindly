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

export interface NormalizedDeliveryUpdate {
  kind: "DELIVERY_UPDATE";
  externalMessageId: string;
  deliveryStatus: "SENT" | "DELIVERED" | "READ" | "FAILED";
  occurredAt: Date;
}

export type NormalizedInboundEvent = NormalizedInboundMessage | NormalizedDeliveryUpdate;

export interface MessagingAdapter {
  readonly channel: string;
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
