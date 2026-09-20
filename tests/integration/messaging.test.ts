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
import { connectMessagingAccount, disconnectMessagingAccount, getMessagingAccount } from "@/modules/messaging/service";
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

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
  registerMessagingAdapter(fakeAdapter);
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

async function connectFakeAccount(organizationId: string, delegateId: string) {
  return connectMessagingAccount({
    organizationId,
    actorUserId: delegateId,
    delegateId,
    channel: "fake",
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

    const updated = await disconnectMessagingAccount(org.id, user.id, account.id);
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
