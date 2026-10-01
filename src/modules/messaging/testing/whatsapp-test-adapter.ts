import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  ConnectionResult,
  ConnectionStatus,
  ConversationRecord,
  MessagingAccountRecord,
  MessagingAdapter,
  MessagingChannelCapabilities,
  NormalizedInboundEvent,
  OutboundMessage,
  SendResult,
} from "@/modules/messaging/adapter";

/**
 * PKG-011: WhatsApp Cloud API against Meta's free *test number* — an
 * engineering tool to validate the real `Meta webhook → Conversation →
 * Inbox` pipeline (real payloads, real HMAC signatures) while the Tech
 * Provider paperwork for PKG-009 runs its course.
 *
 * This is NOT coexistence and never a real connection option for a
 * delegate: the test number is a shared Cloud API number with no phone
 * behind it, which would break the identity principle of `CLAUDE.md`
 * sección 2.1. Registered as "whatsapp-test" (never "whatsapp", reserved
 * for PKG-009) and only when `WHATSAPP_TEST_ADAPTER_ENABLED=true` outside
 * Vercel Production — see `src/instrumentation.ts` and docs/DECISIONS.md.
 */
export interface WhatsAppTestAdapterConfig {
  phoneNumberId: string;
  /** WhatsApp Business Account id; when set, `connectAccount` subscribes it to the app's webhooks. */
  wabaId?: string | null;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  graphApiVersion?: string;
  /** Injectable for unit tests — never a real network call in CI (`CLAUDE.md` sección 6). */
  fetchImpl?: typeof fetch;
}

const DEFAULT_GRAPH_API_VERSION = "v25.0";

const STATUS_MAP: Record<string, "SENT" | "DELIVERED" | "READ" | "FAILED"> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};

interface MetaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body?: string };
}

interface MetaStatus {
  id: string;
  status: string;
  timestamp: string;
}

interface MetaChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

export class WhatsAppTestAdapter implements MessagingAdapter {
  readonly channel = "whatsapp-test";
  readonly capabilities: MessagingChannelCapabilities = {
    serviceWindowHours: 24,
    canDisconnect: true,
    onboarding: "DIRECT",
  };
  private readonly config: WhatsAppTestAdapterConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: WhatsAppTestAdapterConfig) {
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private graphUrl(path: string): string {
    return `https://graph.facebook.com/${this.config.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION}/${path}`;
  }

  private async graphRequest(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(this.graphUrl(path), {
      method: init.method,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      // Only Meta's error message, never the request (it carries the token).
      const error = payload.error as { message?: string; code?: number } | undefined;
      throw new Error(`Meta Graph API ${response.status}: ${error?.message ?? "unknown error"}`);
    }
    return payload;
  }

  /**
   * No OAuth: the credentials were obtained by hand in Meta's dashboard and
   * live in environment variables. Still calls Meta, so a wrong token or
   * phone number id fails here, in `/channels`, instead of silently on the
   * first send.
   */
  async connectAccount(): Promise<ConnectionResult> {
    const phone = await this.graphRequest(`${this.config.phoneNumberId}?fields=display_phone_number,verified_name`, {
      method: "GET",
    });

    if (this.config.wabaId) {
      // Idempotent on Meta's side. Without it the app's callback URL can
      // pass verification and still never receive a single event.
      await this.graphRequest(`${this.config.wabaId}/subscribed_apps`, { method: "POST" });
    }

    const displayPhone = typeof phone.display_phone_number === "string" ? phone.display_phone_number : null;
    return {
      externalAccountId: this.config.phoneNumberId,
      externalBusinessAccountId: this.config.wabaId ?? null,
      phoneE164: displayPhone ? `+${displayPhone.replace(/\D/g, "")}` : null,
      displayName: typeof phone.verified_name === "string" ? `${phone.verified_name} (número de prueba de Meta)` : "Número de prueba de Meta",
      credentialsReference: "env://WHATSAPP_TEST_ACCESS_TOKEN",
    };
  }

  async disconnectAccount(): Promise<void> {
    // Kindly-side only. Deregistering Meta's shared test number would break
    // it for the whole app, and it isn't ours to deregister anyway.
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    return { status: "CONNECTED" };
  }

  async sendMessage(
    _account: MessagingAccountRecord,
    conversation: ConversationRecord,
    message: OutboundMessage,
  ): Promise<SendResult> {
    try {
      const payload = await this.graphRequest(`${this.config.phoneNumberId}/messages`, {
        method: "POST",
        body: {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          // The conversation is keyed by the Contact's wa_id (see parseWebhookEvents).
          to: conversation.externalConversationId,
          type: "text",
          text: { body: message.text },
        },
      });
      const sent = (payload.messages as Array<{ id?: string }> | undefined)?.[0];
      if (!sent?.id) {
        throw new Error("Meta Graph API returned no message id.");
      }
      return { externalMessageId: sent.id, deliveryStatus: "SENT" };
    } catch (error) {
      // Recorded as a FAILED message in the thread rather than thrown, so a
      // rejected send (closed window, unverified recipient) is visible where
      // the delegate wrote it. The id is synthetic: Meta never assigned one.
      // The reason goes to the server log (Vercel), since no column holds it.
      const failureReason = error instanceof Error ? error.message : String(error);
      console.warn(`[whatsapp-test] send failed: ${failureReason}`);
      return {
        externalMessageId: `failed-${randomUUID()}`,
        deliveryStatus: "FAILED",
        failureReason,
      };
    }
  }

  /**
   * Meta's typing indicator: shown for up to 25 s or until the reply
   * arrives, and — in the same call — marks the Contact's message as read.
   * https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators
   */
  async sendTypingIndicator(
    _account: MessagingAccountRecord,
    _conversation: ConversationRecord,
    replyToExternalMessageId: string,
  ): Promise<void> {
    await this.graphRequest(`${this.config.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        status: "read",
        message_id: replyToExternalMessageId,
        typing_indicator: { type: "text" },
      },
    });
  }

  /** HMAC-SHA256 of the raw body with the App Secret, as Meta sends it in `X-Hub-Signature-256`. */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    const header = headers["x-hub-signature-256"];
    if (!header?.startsWith("sha256=")) {
      return false;
    }
    const expected = Buffer.from(createHmac("sha256", this.config.appSecret).update(rawBody, "utf8").digest("hex"), "utf8");
    const received = Buffer.from(header.slice("sha256=".length), "utf8");
    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  /** Meta's subscription handshake (`GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`). */
  verifyWebhookChallenge(query: URLSearchParams): string | null {
    const token = query.get("hub.verify_token") ?? "";
    const challenge = query.get("hub.challenge");
    if (query.get("hub.mode") !== "subscribe" || !challenge) {
      return null;
    }
    const expected = Buffer.from(this.config.verifyToken, "utf8");
    const received = Buffer.from(token, "utf8");
    return expected.length === received.length && timingSafeEqual(expected, received) ? challenge : null;
  }

  parseWebhookEvents(rawBody: string): NormalizedInboundEvent[] {
    const payload = JSON.parse(rawBody) as {
      object?: string;
      entry?: Array<{ changes?: Array<{ field?: string; value?: MetaChangeValue }> }>;
    };
    if (payload.object !== "whatsapp_business_account") {
      return [];
    }

    const events: NormalizedInboundEvent[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        // One app callback receives every number of every subscribed WABA;
        // anything not addressed to this number is not ours to ingest.
        if (change.field !== "messages" || !value || value.metadata?.phone_number_id !== this.config.phoneNumberId) {
          continue;
        }

        for (const message of value.messages ?? []) {
          const contact = value.contacts?.find((candidate) => candidate.wa_id === message.from);
          events.push({
            kind: "MESSAGE",
            // WhatsApp has no conversation id: a 1:1 chat is identified by the Contact's wa_id.
            externalConversationId: message.from,
            externalMessageId: message.id,
            externalContactId: message.from,
            contactDisplayName: contact?.profile?.name ?? null,
            contactPhoneE164: `+${message.from}`,
            text:
              message.type === "text"
                ? (message.text?.body ?? "")
                : `[Mensaje de tipo "${message.type}": Kindly todavía no muestra este tipo de contenido]`,
            occurredAt: new Date(Number(message.timestamp) * 1000),
          });
        }

        for (const status of value.statuses ?? []) {
          const deliveryStatus = STATUS_MAP[status.status];
          if (!deliveryStatus) {
            continue;
          }
          events.push({
            kind: "DELIVERY_UPDATE",
            externalMessageId: status.id,
            deliveryStatus,
            occurredAt: new Date(Number(status.timestamp) * 1000),
          });
        }
      }
    }
    return events;
  }
}
