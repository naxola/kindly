import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { WhatsAppTestAdapter } from "@/modules/messaging/testing/whatsapp-test-adapter";
import type { ConversationRecord, MessagingAccountRecord } from "@/modules/messaging/adapter";

/**
 * Unit tests for PKG-011's adapter: real HMAC verification, Meta's
 * subscription handshake, parsing of Meta's real webhook JSON, and the
 * Graph API calls — with `fetch` injected, never a real network call.
 */

const PHONE_NUMBER_ID = "1355229964336175";
const APP_SECRET = "test-app-secret";

function makeAdapter(fetchImpl?: typeof fetch) {
  return new WhatsAppTestAdapter({
    phoneNumberId: PHONE_NUMBER_ID,
    wabaId: "2211108926469298",
    accessToken: "test-token",
    appSecret: APP_SECRET,
    verifyToken: "my-verify-token",
    fetchImpl,
  });
}

function sign(body: string, secret = APP_SECRET) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Shape captured from Meta's "messages" webhook (Cloud API), ids anonymised.
const inboundTextPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "2211108926469298",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15551739132", phone_number_id: PHONE_NUMBER_ID },
            contacts: [{ profile: { name: "Nacho" }, wa_id: "34600111222" }],
            messages: [
              {
                from: "34600111222",
                id: "wamid.HBgLMzQ2MDAxMTEyMjIVAgASGBQzQTAAAA==",
                timestamp: "1790150400",
                text: { body: "Hola, ¿me ayudas?" },
                type: "text",
              },
            ],
          },
        },
      ],
    },
  ],
};

const statusPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "2211108926469298",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15551739132", phone_number_id: PHONE_NUMBER_ID },
            statuses: [
              { id: "wamid.OUT1", status: "delivered", timestamp: "1790150460", recipient_id: "34600111222" },
              { id: "wamid.OUT1", status: "read", timestamp: "1790150470", recipient_id: "34600111222" },
            ],
          },
        },
      ],
    },
  ],
};

describe("WhatsAppTestAdapter — webhook signature", () => {
  it("accepts Meta's HMAC-SHA256 of the raw body with the App Secret", () => {
    const body = JSON.stringify(inboundTextPayload);
    expect(makeAdapter().verifyWebhookSignature(body, { "x-hub-signature-256": sign(body) })).toBe(true);
  });

  it("rejects a signature made with another secret, a tampered body, or no header", () => {
    const adapter = makeAdapter();
    const body = JSON.stringify(inboundTextPayload);
    expect(adapter.verifyWebhookSignature(body, { "x-hub-signature-256": sign(body, "other") })).toBe(false);
    expect(adapter.verifyWebhookSignature(`${body} `, { "x-hub-signature-256": sign(body) })).toBe(false);
    expect(adapter.verifyWebhookSignature(body, {})).toBe(false);
    expect(adapter.verifyWebhookSignature(body, { "x-hub-signature-256": "sha256=short" })).toBe(false);
  });
});

describe("WhatsAppTestAdapter — subscription handshake", () => {
  it("echoes the challenge only for mode=subscribe with the right verify token", () => {
    const adapter = makeAdapter();
    const ok = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "my-verify-token", "hub.challenge": "12345" });
    expect(adapter.verifyWebhookChallenge(ok)).toBe("12345");

    const wrongToken = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "12345" });
    expect(adapter.verifyWebhookChallenge(wrongToken)).toBeNull();

    const wrongMode = new URLSearchParams({ "hub.mode": "unsubscribe", "hub.verify_token": "my-verify-token", "hub.challenge": "1" });
    expect(adapter.verifyWebhookChallenge(wrongMode)).toBeNull();
  });
});

describe("WhatsAppTestAdapter — parsing Meta's webhook JSON", () => {
  it("turns an inbound text message into a MESSAGE keyed by the sender's wa_id", () => {
    const [event] = makeAdapter().parseWebhookEvents(JSON.stringify(inboundTextPayload));
    expect(event).toEqual({
      kind: "MESSAGE",
      externalConversationId: "34600111222",
      externalMessageId: "wamid.HBgLMzQ2MDAxMTEyMjIVAgASGBQzQTAAAA==",
      externalContactId: "34600111222",
      contactDisplayName: "Nacho",
      contactPhoneE164: "+34600111222",
      text: "Hola, ¿me ayudas?",
      occurredAt: new Date(1790150400 * 1000),
    });
  });

  it("turns statuses into DELIVERY_UPDATEs", () => {
    const events = makeAdapter().parseWebhookEvents(JSON.stringify(statusPayload));
    expect(events.map((event) => event.kind === "DELIVERY_UPDATE" && event.deliveryStatus)).toEqual(["DELIVERED", "READ"]);
  });

  it("keeps non-text messages visible with a placeholder instead of dropping them", () => {
    const payload = structuredClone(inboundTextPayload);
    const message = payload.entry[0].changes[0].value.messages[0] as Record<string, unknown>;
    message.type = "image";
    delete message.text;
    const [event] = makeAdapter().parseWebhookEvents(JSON.stringify(payload));
    expect(event.kind === "MESSAGE" && event.text).toContain('"image"');
  });

  it("ignores events for another phone number, other fields and other objects", () => {
    const adapter = makeAdapter();
    const otherNumber = structuredClone(inboundTextPayload);
    otherNumber.entry[0].changes[0].value.metadata.phone_number_id = "999";
    expect(adapter.parseWebhookEvents(JSON.stringify(otherNumber))).toEqual([]);

    const otherField = structuredClone(inboundTextPayload);
    otherField.entry[0].changes[0].field = "account_update";
    expect(adapter.parseWebhookEvents(JSON.stringify(otherField))).toEqual([]);

    expect(adapter.parseWebhookEvents(JSON.stringify({ object: "page", entry: [] }))).toEqual([]);
  });
});

describe("WhatsAppTestAdapter — Graph API", () => {
  const account = {} as MessagingAccountRecord;
  const conversation = { externalConversationId: "34600111222" } as ConversationRecord;

  it("sends free text to the conversation's wa_id and returns Meta's message id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: "wamid.OUT1" }] }));
    const result = await makeAdapter(fetchImpl).sendMessage(account, conversation, { text: "Claro" });

    expect(result).toEqual({ externalMessageId: "wamid.OUT1", deliveryStatus: "SENT" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`);
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body)).toMatchObject({ messaging_product: "whatsapp", to: "34600111222", type: "text", text: { body: "Claro" } });
  });

  it("records a rejected send as FAILED with Meta's reason, never leaking the token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: "Recipient phone number not in allowed list", code: 131030 } }, 400),
    );
    const result = await makeAdapter(fetchImpl).sendMessage(account, conversation, { text: "Claro" });

    expect(result.deliveryStatus).toBe("FAILED");
    expect(result.externalMessageId).toMatch(/^failed-/);
    expect(result.failureReason).toContain("not in allowed list");
    expect(result.failureReason).not.toContain("test-token");
    warn.mockRestore();
  });

  it("connects by validating the phone number with Meta and subscribing the WABA", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ display_phone_number: "+1 555-173-9132", verified_name: "Test Number" }))
      .mockResolvedValueOnce(jsonResponse({ success: true }));
    const result = await makeAdapter(fetchImpl).connectAccount();

    expect(result).toMatchObject({
      externalAccountId: PHONE_NUMBER_ID,
      externalBusinessAccountId: "2211108926469298",
      phoneE164: "+15551739132",
    });
    expect(fetchImpl.mock.calls[1][0]).toBe("https://graph.facebook.com/v25.0/2211108926469298/subscribed_apps");
    expect(fetchImpl.mock.calls[1][1].method).toBe("POST");
  });

  it("fails the connection when Meta rejects the credentials", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Invalid OAuth access token" } }, 401));
    await expect(makeAdapter(fetchImpl).connectAccount()).rejects.toThrow(
      "Invalid OAuth access token",
    );
  });
});
