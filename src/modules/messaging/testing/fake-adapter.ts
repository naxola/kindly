import { randomUUID } from "node:crypto";
import type {
  ConnectAccountInput,
  MessagingChannelCapabilities,
  ConnectionResult,
  ConnectionStatus,
  ConversationRecord,
  MessagingAccountRecord,
  MessagingAdapter,
  NormalizedInboundEvent,
  OutboundMessage,
  SendResult,
} from "@/modules/messaging/adapter";

/**
 * Test-only double for `MessagingAdapter`. Lives under `src/` (not
 * `tests/fakes/`, where it lived through PKG-003) because
 * `src/instrumentation.ts` (PKG-004) needs to import it — it registers this
 * adapter in a real running server, but *only* when
 * `E2E_FAKE_MESSAGING_CHANNEL=true`, a variable that only
 * `playwright.config.ts` ever sets. Never registered in a real deployment
 * (see docs/DECISIONS.md, bloque "PKG-004").
 *
 * Signature scheme: a shared secret compared verbatim against the
 * `x-fake-signature` header. Real providers use HMAC-over-raw-body; this
 * only needs to prove the pipeline validates *before* persisting and
 * rejects *after*, not to model a specific provider's scheme.
 */
export interface FakeAdapterOptions extends Partial<MessagingChannelCapabilities> {
  /** Register under a different channel name, so one test run can hold several fakes with different capabilities. */
  channel?: string;
}

export class FakeMessagingAdapter implements MessagingAdapter {
  readonly channel: string;
  /**
   * Defaults describe an unrestricted channel, so the suites written before
   * PKG-005 keep passing unchanged. Tests that need coexistence's awkward
   * shape (a 24h window, a connection Kindly cannot end) pass their own.
   */
  readonly capabilities: MessagingChannelCapabilities;
  private readonly secret: string;
  public sentMessages: Array<{ account: MessagingAccountRecord; conversation: ConversationRecord; message: OutboundMessage }> = [];
  /**
   * Forces the id the next `sendMessage` returns, so a test can make an
   * echo and a Kindly-sent message collide on
   * `(messaging_account_id, external_message_id)` deliberately — the whole
   * point of the echo idempotency rules (PKG-005).
   */
  public nextExternalMessageId: string | null = null;

  constructor(secret = "fake-shared-secret", options: FakeAdapterOptions = {}) {
    this.secret = secret;
    this.channel = options.channel ?? "fake";
    this.capabilities = {
      serviceWindowHours: options.serviceWindowHours ?? null,
      canDisconnect: options.canDisconnect ?? true,
      onboarding: options.onboarding ?? "DIRECT",
    };
  }

  /** Set by a test to exercise the failure path of a connection attempt. */
  public failNextConnect: string | null = null;

  async connectAccount(input: ConnectAccountInput): Promise<ConnectionResult> {
    if (this.failNextConnect) {
      const reason = this.failNextConnect;
      this.failNextConnect = null;
      throw new Error(reason);
    }
    return {
      externalAccountId: `fake-account-${randomUUID()}`,
      displayName: `Fake account for ${input.delegateId}`,
      credentialsReference: "fake-secret-store://not-a-real-secret",
    };
  }

  async disconnectAccount(): Promise<void> {
    // No external side effect to undo for the fake channel.
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { status: "CONNECTED" };
  }

  async sendMessage(
    account: MessagingAccountRecord,
    conversation: ConversationRecord,
    message: OutboundMessage,
  ): Promise<SendResult> {
    this.sentMessages.push({ account, conversation, message });
    const externalMessageId = this.nextExternalMessageId ?? `fake-outbound-${randomUUID()}`;
    this.nextExternalMessageId = null;
    return { externalMessageId, deliveryStatus: "SENT" };
  }

  verifyWebhookSignature(_rawBody: string, headers: Record<string, string>): boolean {
    return headers["x-fake-signature"] === this.secret;
  }

  parseWebhookEvents(rawBody: string): NormalizedInboundEvent[] {
    const payload = JSON.parse(rawBody) as unknown;
    const rawEvents = Array.isArray(payload) ? payload : [payload];
    return rawEvents.map((raw) => {
      const event = raw as Record<string, unknown>;
      if (event.kind === "HISTORY_MESSAGE") {
        return {
          kind: "HISTORY_MESSAGE",
          externalConversationId: String(event.externalConversationId),
          externalMessageId: String(event.externalMessageId),
          externalContactId: String(event.externalContactId),
          contactDisplayName: (event.contactDisplayName as string | null) ?? null,
          contactPhoneE164: (event.contactPhoneE164 as string | null) ?? null,
          direction: event.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND",
          text: String(event.text),
          occurredAt: event.occurredAt ? new Date(String(event.occurredAt)) : new Date(),
        };
      }
      if (event.kind === "ACCOUNT_DISCONNECTED") {
        return {
          kind: "ACCOUNT_DISCONNECTED",
          reason: (event.reason as string | null) ?? null,
          occurredAt: new Date(),
        };
      }
      if (event.kind === "OUTBOUND_ECHO") {
        return {
          kind: "OUTBOUND_ECHO",
          externalConversationId: String(event.externalConversationId),
          externalMessageId: String(event.externalMessageId),
          externalContactId: String(event.externalContactId),
          contactDisplayName: (event.contactDisplayName as string | null) ?? null,
          contactPhoneE164: (event.contactPhoneE164 as string | null) ?? null,
          text: String(event.text),
          occurredAt: new Date(),
        };
      }
      if (event.kind === "DELIVERY_UPDATE") {
        return {
          kind: "DELIVERY_UPDATE",
          externalMessageId: String(event.externalMessageId),
          deliveryStatus: event.deliveryStatus as "SENT" | "DELIVERED" | "READ" | "FAILED",
          occurredAt: new Date(),
        };
      }
      return {
        kind: "MESSAGE",
        externalConversationId: String(event.externalConversationId),
        externalMessageId: String(event.externalMessageId),
        externalContactId: String(event.externalContactId),
        contactDisplayName: (event.contactDisplayName as string | null) ?? null,
        contactPhoneE164: (event.contactPhoneE164 as string | null) ?? null,
        text: String(event.text),
        occurredAt: new Date(),
      };
    });
  }

  signatureHeaders(): Record<string, string> {
    return { "x-fake-signature": this.secret };
  }
}
