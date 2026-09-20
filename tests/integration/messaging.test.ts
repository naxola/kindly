import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { webhookEvents } from "@/modules/messaging/schema";
import {
  connectMessagingAccount,
  disconnectMessagingAccount,
  getMessagingAccount,
  listMessagingAccountsForMember,
} from "@/modules/messaging/service";
import { listConversationsWithPreview } from "@/modules/conversations/service";
import { clearMessagingAdapters, registerMessagingAdapter } from "@/modules/messaging/registry";
import { receiveWebhook } from "@/modules/messaging/webhook-service";
import { getConversation, listConversations, listMessages, sendOutboundMessage } from "@/modules/conversations/service";
import { listActivitiesForEntity } from "@/modules/audit/service";
import { FakeMessagingAdapter } from "@/modules/messaging/testing/fake-adapter";

/**
 * Integration tests for PKG-003 (Messaging core, backend): MessagingAccount
 * connect/disconnect, the webhook pipeline's idempotency/signature rules,
 * outbound send, and multi-tenant isolation — against real PostgreSQL.
 *
 * The webhook HTTP route (src/app/api/webhooks/[channel]/[accountId]/route.ts)
 * is a thin adapter over `receiveWebhook` (ARCHITECTURE.md: no domain logic
 * in route handlers). Its 200 path calls Next's `after()`, which needs a
 * real request context that doesn't exist when calling the exported POST
 * function directly under Vitest — so the pipeline itself is exercised here
 * via `receiveWebhook` + manually invoking the returned `process` callback
 * (exactly what `after()` would do), and only the early-exit 404/401 paths
 * (which never touch `after()`) are worth hitting through the route
 * directly — covered implicitly since `receiveWebhook` returns those same
 * statuses.
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const fakeAdapter = new FakeMessagingAdapter();
/**
 * A second fake shaped like WhatsApp coexistence (PKG-005): a 24h free-form
 * window, and a connection Kindly cannot end from its side. Registered as
 * its own channel so the pre-existing suites keep exercising the
 * unrestricted defaults.
 */
const coexAdapter = new FakeMessagingAdapter("fake-shared-secret", {
  channel: "fake-coex",
  serviceWindowHours: 24,
  canDisconnect: false,
});

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
  registerMessagingAdapter(fakeAdapter);
  registerMessagingAdapter(coexAdapter);
});

afterAll(async () => {
  clearMessagingAdapters();
  await client.end();
});

async function createTestUserAndOrg(name: string) {
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
    .returning();
  const [org] = await db.insert(organizations).values({ name: `${name}'s org` }).returning();
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "ADMIN" });
  return { user, org };
}

async function connectFakeAccount(organizationId: string, delegateId: string, channel = "fake") {
  return connectMessagingAccount({
    organizationId,
    actorUserId: delegateId,
    delegateId,
    channel,
  });
}

describe("PKG-003 Messaging core (integration, real PostgreSQL)", () => {
  it("connects a MessagingAccount via the adapter and logs CHANNEL_CONNECTED", async () => {
    const { user, org } = await createTestUserAndOrg("Channel Owner");
    const account = await connectFakeAccount(org.id, user.id);

    expect(account.status).toBe("CONNECTED");
    expect(account.channel).toBe("fake");

    const activities = await listActivitiesForEntity(org.id, "messaging_account", account.id);
    expect(activities.map((a) => a.type)).toContain("CHANNEL_CONNECTED");
  });

  it("disconnects a MessagingAccount and logs CHANNEL_DISCONNECTED", async () => {
    const { user, org } = await createTestUserAndOrg("Channel Closer");
    const account = await connectFakeAccount(org.id, user.id);

    const updated = await disconnectMessagingAccount({ organizationId: org.id, userId: user.id, role: "ADMIN" }, account.id);
    expect(updated?.status).toBe("DISCONNECTED");
    expect(updated?.disconnectedAt).not.toBeNull();

    const activities = await listActivitiesForEntity(org.id, "messaging_account", account.id);
    expect(activities.map((a) => a.type)).toContain("CHANNEL_DISCONNECTED");
  });

  describe("webhook pipeline", () => {
    it("returns 404 for an unregistered channel", async () => {
      const outcome = await receiveWebhook("unregistered-channel", randomUUID(), "{}", {});
      expect(outcome.status).toBe(404);
    });

    it("returns 404 for an unknown accountId on a registered channel", async () => {
      const outcome = await receiveWebhook("fake", randomUUID(), "{}", {});
      expect(outcome.status).toBe(404);
    });

    it("rejects an invalid signature with 401 and persists nothing", async () => {
      const { user, org } = await createTestUserAndOrg("Bad Signature Org");
      const account = await connectFakeAccount(org.id, user.id);

      const outcome = await receiveWebhook("fake", account.id, "{}", { "x-fake-signature": "wrong" });
      expect(outcome.status).toBe(401);

      const events = await db.select().from(webhookEvents).where(eq(webhookEvents.messagingAccountId, account.id));
      expect(events).toHaveLength(0);
    });

    it("accepts a valid signature, persists the event, and creates Contact/Conversation/Message on processing", async () => {
      const { user, org } = await createTestUserAndOrg("Inbound Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const externalMessageId = `msg-${randomUUID()}`;
      const body = JSON.stringify({
        externalConversationId,
        externalMessageId,
        externalContactId: "provider-contact-1",
        contactDisplayName: "Ada Lovelace",
        text: "Hola, necesito ayuda",
      });

      const outcome = await receiveWebhook("fake", account.id, body, fakeAdapter.signatureHeaders());
      expect(outcome.status).toBe(200);
      if (outcome.status !== 200) throw new Error("unreachable");

      const [event] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, outcome.webhookEventId));
      expect(event.processedAt).toBeNull();

      await outcome.process();

      const [processed] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, outcome.webhookEventId));
      expect(processed.processedAt).not.toBeNull();
      expect(processed.processingError).toBeNull();

      const conversations = await listConversations(org.id);
      expect(conversations).toHaveLength(1);
      expect(conversations[0].externalConversationId).toBe(externalConversationId);

      const conversationMessages = await listMessages(org.id, conversations[0].id);
      expect(conversationMessages).toHaveLength(1);
      expect(conversationMessages[0].body).toBe("Hola, necesito ayuda");
      expect(conversationMessages[0].direction).toBe("INBOUND");

      const activities = await listActivitiesForEntity(org.id, "conversation", conversations[0].id);
      expect(activities.map((a) => a.type)).toContain("MESSAGE_RECEIVED");
    });

    it("never duplicates a Message when the same webhook is delivered twice", async () => {
      const { user, org } = await createTestUserAndOrg("Duplicate Webhook Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const externalMessageId = `msg-${randomUUID()}`;
      const body = JSON.stringify({
        externalConversationId,
        externalMessageId,
        externalContactId: "provider-contact-2",
        text: "Repetido",
      });

      const first = await receiveWebhook("fake", account.id, body, fakeAdapter.signatureHeaders());
      const second = await receiveWebhook("fake", account.id, body, fakeAdapter.signatureHeaders());
      if (first.status !== 200 || second.status !== 200) throw new Error("unreachable");

      await first.process();
      await second.process();

      const conversations = await listConversations(org.id);
      const conversation = conversations.find((c) => c.externalConversationId === externalConversationId)!;
      const conversationMessages = await listMessages(org.id, conversation.id);
      expect(conversationMessages).toHaveLength(1);

      const activities = await listActivitiesForEntity(org.id, "conversation", conversation.id);
      expect(activities.filter((a) => a.type === "MESSAGE_RECEIVED")).toHaveLength(1);
    });

    it("applies a delivery-status update to the existing outbound Message instead of creating a new one", async () => {
      const { user, org } = await createTestUserAndOrg("Delivery Update Org");
      const account = await connectFakeAccount(org.id, user.id);

      // Seed a conversation with an inbound message first (an outbound reply needs a conversation to belong to).
      const inboundExternalConversationId = `chat-${randomUUID()}`;
      const inbound = await receiveWebhook(
        "fake",
        account.id,
        JSON.stringify({
          externalConversationId: inboundExternalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-3",
          text: "Hola",
        }),
        fakeAdapter.signatureHeaders(),
      );
      if (inbound.status !== 200) throw new Error("unreachable");
      await inbound.process();

      const conversation = (await listConversations(org.id)).find(
        (c) => c.externalConversationId === inboundExternalConversationId,
      )!;

      const sent = await sendOutboundMessage({
        organizationId: org.id,
        actorUserId: user.id,
        conversationId: conversation.id,
        text: "Hola, en qué puedo ayudarte",
      });
      expect(sent.deliveryStatus).toBe("SENT");

      const deliveryUpdate = await receiveWebhook(
        "fake",
        account.id,
        JSON.stringify({ kind: "DELIVERY_UPDATE", externalMessageId: sent.externalMessageId, deliveryStatus: "READ" }),
        fakeAdapter.signatureHeaders(),
      );
      if (deliveryUpdate.status !== 200) throw new Error("unreachable");
      await deliveryUpdate.process();

      const conversationMessages = await listMessages(org.id, conversation.id);
      const updatedMessage = conversationMessages.find((m) => m.id === sent.id)!;
      expect(updatedMessage.deliveryStatus).toBe("READ");
      // Still exactly the inbound + this one outbound message — no third row appeared.
      expect(conversationMessages).toHaveLength(2);

      const activities = await listActivitiesForEntity(org.id, "conversation", conversation.id);
      expect(activities.map((a) => a.type)).toContain("MESSAGE_SENT");
    });
  });

  /**
   * PKG-005 — WhatsApp coexistence echoes the delegate's own phone messages
   * back to us (`smb_message_echoes`). These cover the rule that matters
   * most on that channel: an echo must never duplicate a message, least of
   * all one Kindly itself sent.
   */
  describe("outbound echoes (coexistence)", () => {
    async function echoBody(overrides: Record<string, unknown>) {
      return JSON.stringify({
        kind: "OUTBOUND_ECHO",
        externalContactId: "provider-contact-echo",
        text: "Te llamo en un rato",
        ...overrides,
      });
    }

    it("creates Conversation, Contact and an OUTBOUND message when the delegate writes from their phone first", async () => {
      const { user, org } = await createTestUserAndOrg("Echo First Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const outcome = await receiveWebhook(
        "fake",
        account.id,
        await echoBody({
          externalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          contactDisplayName: "Grace Hopper",
        }),
        fakeAdapter.signatureHeaders(),
      );
      if (outcome.status !== 200) throw new Error("unreachable");
      await outcome.process();

      const conversation = (await listConversations(org.id)).find(
        (c) => c.externalConversationId === externalConversationId,
      )!;
      expect(conversation).toBeDefined();

      const conversationMessages = await listMessages(org.id, conversation.id);
      expect(conversationMessages).toHaveLength(1);
      expect(conversationMessages[0].direction).toBe("OUTBOUND");
      expect(conversationMessages[0].sentFromDevice).toBe(true);
      expect(conversationMessages[0].deliveryStatus).toBe("SENT");

      const activities = await listActivitiesForEntity(org.id, "conversation", conversation.id);
      expect(activities.map((a) => a.type)).toContain("MESSAGE_SENT_FROM_DEVICE");
      // Nobody acted inside Kindly, so this is not a MESSAGE_SENT.
      expect(activities.map((a) => a.type)).not.toContain("MESSAGE_SENT");
    });

    it("never duplicates a message Kindly sent when the provider echoes it back", async () => {
      const { user, org } = await createTestUserAndOrg("Echo Of Own Send Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const inbound = await receiveWebhook(
        "fake",
        account.id,
        JSON.stringify({
          externalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-echo-2",
          text: "Hola",
        }),
        fakeAdapter.signatureHeaders(),
      );
      if (inbound.status !== 200) throw new Error("unreachable");
      await inbound.process();

      const conversation = (await listConversations(org.id)).find(
        (c) => c.externalConversationId === externalConversationId,
      )!;

      const sharedExternalMessageId = `msg-${randomUUID()}`;
      fakeAdapter.nextExternalMessageId = sharedExternalMessageId;
      const sent = await sendOutboundMessage({
        organizationId: org.id,
        actorUserId: user.id,
        conversationId: conversation.id,
        text: "Respuesta desde Kindly",
      });

      const echo = await receiveWebhook(
        "fake",
        account.id,
        await echoBody({
          externalConversationId,
          externalMessageId: sharedExternalMessageId,
          text: "Respuesta desde Kindly",
        }),
        fakeAdapter.signatureHeaders(),
      );
      if (echo.status !== 200) throw new Error("unreachable");
      await echo.process();

      const conversationMessages = await listMessages(org.id, conversation.id);
      // The inbound seed plus exactly one outbound — the echo added nothing.
      expect(conversationMessages).toHaveLength(2);

      const outbound = conversationMessages.find((m) => m.id === sent.id)!;
      expect(outbound.sentFromDevice).toBe(false);

      const activities = await listActivitiesForEntity(org.id, "conversation", conversation.id);
      expect(activities.filter((a) => a.type === "MESSAGE_SENT_FROM_DEVICE")).toHaveLength(0);
    });

    it("labels the message as composed in Kindly even when its echo arrives first", async () => {
      const { user, org } = await createTestUserAndOrg("Echo Race Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const sharedExternalMessageId = `msg-${randomUUID()}`;

      // The echo wins the race and owns the row first, flagged as written
      // on the phone.
      const echo = await receiveWebhook(
        "fake",
        account.id,
        await echoBody({
          externalConversationId,
          externalMessageId: sharedExternalMessageId,
          text: "Mensaje en carrera",
        }),
        fakeAdapter.signatureHeaders(),
      );
      if (echo.status !== 200) throw new Error("unreachable");
      await echo.process();

      const conversation = (await listConversations(org.id)).find(
        (c) => c.externalConversationId === externalConversationId,
      )!;
      expect((await listMessages(org.id, conversation.id))[0].sentFromDevice).toBe(true);

      fakeAdapter.nextExternalMessageId = sharedExternalMessageId;
      await sendOutboundMessage({
        organizationId: org.id,
        actorUserId: user.id,
        conversationId: conversation.id,
        text: "Mensaje en carrera",
      });

      const conversationMessages = await listMessages(org.id, conversation.id);
      expect(conversationMessages).toHaveLength(1);
      expect(conversationMessages[0].sentFromDevice).toBe(false);
    });

    it("never duplicates a Message when the same echo is delivered twice", async () => {
      const { user, org } = await createTestUserAndOrg("Echo Duplicate Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const body = await echoBody({
        externalConversationId,
        externalMessageId: `msg-${randomUUID()}`,
      });

      const first = await receiveWebhook("fake", account.id, body, fakeAdapter.signatureHeaders());
      const second = await receiveWebhook("fake", account.id, body, fakeAdapter.signatureHeaders());
      if (first.status !== 200 || second.status !== 200) throw new Error("unreachable");
      await first.process();
      await second.process();

      const conversation = (await listConversations(org.id)).find(
        (c) => c.externalConversationId === externalConversationId,
      )!;
      expect(await listMessages(org.id, conversation.id)).toHaveLength(1);

      const activities = await listActivitiesForEntity(org.id, "conversation", conversation.id);
      expect(activities.filter((a) => a.type === "MESSAGE_SENT_FROM_DEVICE")).toHaveLength(1);
    });
  });

  /**
   * PKG-005 — the rest of what coexistence forces on the domain: a history
   * replay that is not news, a disconnection Kindly never initiates, and a
   * provider window that closes regardless of what the delegate does.
   */
  describe("history import", () => {
    it("imports past messages of both directions without marking the conversation unread", async () => {
      const { user, org } = await createTestUserAndOrg("History Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const body = JSON.stringify([
        {
          kind: "HISTORY_MESSAGE",
          externalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-history",
          contactDisplayName: "Alan Turing",
          direction: "INBOUND",
          text: "Mensaje viejo del contacto",
          occurredAt: "2026-08-01T10:00:00.000Z",
        },
        {
          kind: "HISTORY_MESSAGE",
          externalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-history",
          direction: "OUTBOUND",
          text: "Respuesta vieja del delegado",
          occurredAt: "2026-08-01T11:00:00.000Z",
        },
      ]);

      const outcome = await receiveWebhook("fake", account.id, body, fakeAdapter.signatureHeaders());
      if (outcome.status !== 200) throw new Error("unreachable");
      await outcome.process();

      const conversation = (await listConversations(org.id)).find(
        (c) => c.externalConversationId === externalConversationId,
      )!;
      const conversationMessages = await listMessages(org.id, conversation.id);
      expect(conversationMessages).toHaveLength(2);

      const outbound = conversationMessages.find((m) => m.direction === "OUTBOUND")!;
      // It predates the connection, so Kindly cannot have composed it.
      expect(outbound.sentFromDevice).toBe(true);

      // 180 days of imported threads must not land as a wall of unread.
      const preview = (await listConversationsWithPreview(org.id)).find((p) => p.id === conversation.id)!;
      expect(preview.unread).toBe(false);

      // And no Activity per imported message.
      const activities = await listActivitiesForEntity(org.id, "conversation", conversation.id);
      expect(activities).toHaveLength(0);
    });

    it("is idempotent when a history phase is delivered twice", async () => {
      const { user, org } = await createTestUserAndOrg("History Repeat Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const body = JSON.stringify({
        kind: "HISTORY_MESSAGE",
        externalConversationId,
        externalMessageId: `msg-${randomUUID()}`,
        externalContactId: "provider-contact-history-2",
        direction: "INBOUND",
        text: "Se entrega dos veces",
        occurredAt: "2026-08-02T10:00:00.000Z",
      });

      const first = await receiveWebhook("fake", account.id, body, fakeAdapter.signatureHeaders());
      const second = await receiveWebhook("fake", account.id, body, fakeAdapter.signatureHeaders());
      if (first.status !== 200 || second.status !== 200) throw new Error("unreachable");
      await first.process();
      await second.process();

      const conversation = (await listConversations(org.id)).find(
        (c) => c.externalConversationId === externalConversationId,
      )!;
      expect(await listMessages(org.id, conversation.id)).toHaveLength(1);
    });

    it("leaves a genuinely newer live message unread after a history import", async () => {
      const { user, org } = await createTestUserAndOrg("History Then Live Org");
      const account = await connectFakeAccount(org.id, user.id);

      const externalConversationId = `chat-${randomUUID()}`;
      const history = await receiveWebhook(
        "fake",
        account.id,
        JSON.stringify({
          kind: "HISTORY_MESSAGE",
          externalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-history-3",
          direction: "INBOUND",
          text: "Antiguo",
          occurredAt: "2026-08-03T10:00:00.000Z",
        }),
        fakeAdapter.signatureHeaders(),
      );
      if (history.status !== 200) throw new Error("unreachable");
      await history.process();

      const live = await receiveWebhook(
        "fake",
        account.id,
        JSON.stringify({
          externalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-history-3",
          text: "Nuevo de verdad",
        }),
        fakeAdapter.signatureHeaders(),
      );
      if (live.status !== 200) throw new Error("unreachable");
      await live.process();

      const conversation = (await listConversations(org.id)).find(
        (c) => c.externalConversationId === externalConversationId,
      )!;
      const preview = (await listConversationsWithPreview(org.id)).find((p) => p.id === conversation.id)!;
      expect(preview.unread).toBe(true);
    });
  });

  describe("disconnection initiated outside Kindly", () => {
    it("marks the account DISCONNECTED from a provider webhook, with no acting user", async () => {
      const { user, org } = await createTestUserAndOrg("Provider Disconnect Org");
      const account = await connectFakeAccount(org.id, user.id, "fake-coex");

      const outcome = await receiveWebhook(
        "fake-coex",
        account.id,
        JSON.stringify({ kind: "ACCOUNT_DISCONNECTED", reason: "PARTNER_REMOVED" }),
        coexAdapter.signatureHeaders(),
      );
      if (outcome.status !== 200) throw new Error("unreachable");
      await outcome.process();

      const updated = await getMessagingAccount(org.id, account.id);
      expect(updated?.status).toBe("DISCONNECTED");
      expect(updated?.disconnectedAt).not.toBeNull();
      expect(updated?.lastError).toBe("PARTNER_REMOVED");

      const activities = await listActivitiesForEntity(org.id, "messaging_account", account.id);
      const disconnection = activities.find((a) => a.type === "CHANNEL_DISCONNECTED")!;
      expect(disconnection.actorUserId).toBeNull();
    });

    it("does not log a second disconnection when the webhook is redelivered", async () => {
      const { user, org } = await createTestUserAndOrg("Provider Disconnect Repeat Org");
      const account = await connectFakeAccount(org.id, user.id, "fake-coex");

      const body = JSON.stringify({ kind: "ACCOUNT_DISCONNECTED", reason: "PARTNER_REMOVED" });
      for (let attempt = 0; attempt < 2; attempt++) {
        const outcome = await receiveWebhook("fake-coex", account.id, body, coexAdapter.signatureHeaders());
        if (outcome.status !== 200) throw new Error("unreachable");
        await outcome.process();
      }

      const activities = await listActivitiesForEntity(org.id, "messaging_account", account.id);
      expect(activities.filter((a) => a.type === "CHANNEL_DISCONNECTED")).toHaveLength(1);
    });

    it("refuses to disconnect from Kindly a channel that only the delegate's device can end", async () => {
      const { user, org } = await createTestUserAndOrg("Cannot Disconnect Org");
      const account = await connectFakeAccount(org.id, user.id, "fake-coex");

      await expect(
        disconnectMessagingAccount({ organizationId: org.id, userId: user.id, role: "ADMIN" }, account.id),
      ).rejects.toThrow(
        /cannot be disconnected from Kindly/,
      );

      // And the row is untouched — no optimistic DISCONNECTED left behind.
      expect((await getMessagingAccount(org.id, account.id))?.status).toBe("CONNECTED");
    });
  });

  describe("provider messaging window", () => {
    async function seedCoexConversation(orgId: string, accountId: string, inboundAt: Date) {
      const externalConversationId = `chat-${randomUUID()}`;
      const outcome = await receiveWebhook(
        "fake-coex",
        accountId,
        JSON.stringify({
          kind: "HISTORY_MESSAGE",
          externalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-window",
          direction: "INBOUND",
          text: "Hola",
          occurredAt: inboundAt.toISOString(),
        }),
        coexAdapter.signatureHeaders(),
      );
      if (outcome.status !== 200) throw new Error("unreachable");
      await outcome.process();
      return (await listConversations(orgId)).find((c) => c.externalConversationId === externalConversationId)!;
    }

    it("refuses to send when the window has elapsed since the Contact's last message", async () => {
      const { user, org } = await createTestUserAndOrg("Closed Window Org");
      const account = await connectFakeAccount(org.id, user.id, "fake-coex");
      const conversation = await seedCoexConversation(
        org.id,
        account.id,
        new Date(Date.now() - 48 * 60 * 60 * 1000),
      );

      await expect(
        sendOutboundMessage({
          organizationId: org.id,
          actorUserId: user.id,
          conversationId: conversation.id,
          text: "Fuera de ventana",
        }),
      ).rejects.toThrow(/messaging window/);

      expect(await listMessages(org.id, conversation.id)).toHaveLength(1);
    });

    it("allows sending while the window is still open", async () => {
      const { user, org } = await createTestUserAndOrg("Open Window Org");
      const account = await connectFakeAccount(org.id, user.id, "fake-coex");
      const conversation = await seedCoexConversation(org.id, account.id, new Date(Date.now() - 60 * 1000));

      const sent = await sendOutboundMessage({
        organizationId: org.id,
        actorUserId: user.id,
        conversationId: conversation.id,
        text: "Dentro de ventana",
      });
      expect(sent.deliveryStatus).toBe("SENT");
    });

    it("does not let the delegate's own phone reopen a closed window", async () => {
      const { user, org } = await createTestUserAndOrg("Echo Does Not Reopen Org");
      const account = await connectFakeAccount(org.id, user.id, "fake-coex");
      const conversation = await seedCoexConversation(
        org.id,
        account.id,
        new Date(Date.now() - 48 * 60 * 60 * 1000),
      );

      // The delegate writes from their phone right now — the echo lands as
      // a brand-new OUTBOUND message, but the window stays shut.
      const echo = await receiveWebhook(
        "fake-coex",
        account.id,
        JSON.stringify({
          kind: "OUTBOUND_ECHO",
          externalConversationId: conversation.externalConversationId,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-window",
          text: "Escrito desde el móvil ahora mismo",
        }),
        coexAdapter.signatureHeaders(),
      );
      if (echo.status !== 200) throw new Error("unreachable");
      await echo.process();

      await expect(
        sendOutboundMessage({
          organizationId: org.id,
          actorUserId: user.id,
          conversationId: conversation.id,
          text: "¿Se ha reabierto?",
        }),
      ).rejects.toThrow(/messaging window/);
    });
  });

  /**
   * PKG-007 — a channel is the professional's own communication identity
   * (CLAUDE.md principio 1), so who may see and end one is not a cosmetic
   * UI question.
   */
  describe("per-delegate scoping of channels", () => {
    async function addMember(organizationId: string, name: string, role: "ADMIN" | "DELEGATE") {
      const [user] = await db
        .insert(users)
        .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
        .returning();
      await db.insert(organizationMembers).values({ organizationId, userId: user.id, role });
      return user;
    }

    it("shows a DELEGATE only their own accounts and an ADMIN all of them", async () => {
      const { user: admin, org } = await createTestUserAndOrg("Scoping Admin");
      const delegate = await addMember(org.id, "Scoped Delegate", "DELEGATE");

      const adminAccount = await connectFakeAccount(org.id, admin.id);
      const delegateAccount = await connectFakeAccount(org.id, delegate.id);

      const seenByDelegate = await listMessagingAccountsForMember(org.id, {
        userId: delegate.id,
        role: "DELEGATE",
      });
      expect(seenByDelegate.map((a) => a.id)).toEqual([delegateAccount.id]);

      const seenByAdmin = await listMessagingAccountsForMember(org.id, { userId: admin.id, role: "ADMIN" });
      expect(seenByAdmin.map((a) => a.id).sort()).toEqual([adminAccount.id, delegateAccount.id].sort());
    });

    it("refuses to connect a channel on someone else's behalf, even for an ADMIN", async () => {
      const { user: admin, org } = await createTestUserAndOrg("Impersonating Admin");
      const delegate = await addMember(org.id, "Unwilling Delegate", "DELEGATE");

      await expect(
        connectMessagingAccount({
          organizationId: org.id,
          actorUserId: admin.id,
          delegateId: delegate.id,
          channel: "fake",
        }),
      ).rejects.toThrow(/only be connected by the delegate who owns it/);
    });

    it("refuses to let a DELEGATE disconnect a colleague's channel, but lets the ADMIN do it", async () => {
      const { user: admin, org } = await createTestUserAndOrg("Disconnect Scoping Admin");
      const delegate = await addMember(org.id, "Other Delegate", "DELEGATE");
      const adminAccount = await connectFakeAccount(org.id, admin.id);

      await expect(
        disconnectMessagingAccount(
          { organizationId: org.id, userId: delegate.id, role: "DELEGATE" },
          adminAccount.id,
        ),
      ).rejects.toThrow(/can only disconnect their own channel/);
      expect((await getMessagingAccount(org.id, adminAccount.id))?.status).toBe("CONNECTED");

      const delegateAccount = await connectFakeAccount(org.id, delegate.id);
      const updated = await disconnectMessagingAccount(
        { organizationId: org.id, userId: admin.id, role: "ADMIN" },
        delegateAccount.id,
      );
      expect(updated?.status).toBe("DISCONNECTED");
    });
  });

  describe("a provider that refuses the connection", () => {
    it("leaves no half-created MessagingAccount behind", async () => {
      const { user, org } = await createTestUserAndOrg("Refused Connection Org");

      fakeAdapter.failNextConnect = "El número no está en WhatsApp Business App.";
      await expect(connectFakeAccount(org.id, user.id)).rejects.toThrow(/WhatsApp Business App/);

      // No row, no CHANNEL_CONNECTED activity: a failed attempt is not a
      // connection in any state.
      expect(await listMessagingAccountsForMember(org.id, { userId: user.id, role: "ADMIN" })).toHaveLength(0);

      // And the adapter is usable again straight after — a refusal is not
      // a latch.
      const account = await connectFakeAccount(org.id, user.id);
      expect(account.status).toBe("CONNECTED");
    });
  });

  describe("multi-tenant isolation", () => {
    it("an organization cannot read another organization's MessagingAccount, Conversation, or Message", async () => {
      const { user: userA, org: orgA } = await createTestUserAndOrg("Isolation Messaging A");
      const { org: orgB } = await createTestUserAndOrg("Isolation Messaging B");

      const accountA = await connectFakeAccount(orgA.id, userA.id);
      const webhook = await receiveWebhook(
        "fake",
        accountA.id,
        JSON.stringify({
          externalConversationId: `chat-${randomUUID()}`,
          externalMessageId: `msg-${randomUUID()}`,
          externalContactId: "provider-contact-4",
          text: "Secreto",
        }),
        fakeAdapter.signatureHeaders(),
      );
      if (webhook.status !== 200) throw new Error("unreachable");
      await webhook.process();

      expect(await getMessagingAccount(orgB.id, accountA.id)).toBeNull();
      expect(await listConversations(orgB.id)).toHaveLength(0);

      const conversationA = (await listConversations(orgA.id))[0];
      expect(await getConversation(orgB.id, conversationA.id)).toBeNull();

      await expect(
        sendOutboundMessage({
          organizationId: orgB.id,
          actorUserId: userA.id,
          conversationId: conversationA.id,
          text: "Intento ajeno",
        }),
      ).rejects.toThrow();
    });
  });
});
