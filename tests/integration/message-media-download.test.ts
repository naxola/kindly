import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { activities } from "@/modules/audit/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { conversations, messages } from "@/modules/conversations/schema";
import { messagingAccounts } from "@/modules/messaging/schema";
import { createContact } from "@/modules/contacts/service";
import { insertInboundMessage, getConversationThreadState } from "@/modules/conversations/service";
import { clearMessagingAdapters, registerMessagingAdapter } from "@/modules/messaging/registry";
import { receiveWebhook } from "@/modules/messaging/webhook-service";
import { FakeMessagingAdapter } from "@/modules/messaging/testing/fake-adapter";
import { MEDIA_DOWNLOADS_PER_MINUTE, type MessageAttachment } from "@/modules/messaging/attachments";

/**
 * UI-10c: files in conversations — how a message keeps only a descriptor, and
 * the pass-through download proxy (access, expiry, rate limit, nothing
 * written anywhere) — against real PostgreSQL, with the session mocked.
 */

type Member = { organizationId: string; userId: string; role: "ADMIN" | "DELEGATE" };
let currentMember: Member | null = null;
vi.mock("@/modules/organizations/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/organizations/service")>()),
  getCurrentOrganizationMember: async () => currentMember,
}));

const { GET } = await import("@/app/api/conversations/[id]/messages/[messageId]/media/route");

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const fake = new FakeMessagingAdapter("secret");

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations") });
});
afterAll(async () => {
  clearMessagingAdapters();
  await client.end();
});
beforeEach(() => {
  currentMember = null;
  fake.downloads = [];
  clearMessagingAdapters();
  registerMessagingAdapter(fake);
});
afterEach(() => vi.restoreAllMocks());

const passport: MessageAttachment = { kind: "DOCUMENT", mediaId: "media-1", mimeType: "application/pdf", filename: "Pasaporte.pdf" };

async function user(name: string) {
  const [row] = await db.insert(users).values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` }).returning();
  return row;
}

async function setup() {
  const [org] = await db.insert(organizations).values({ name: `org-media-${randomUUID()}` }).returning();
  const [admin, ana, luis] = await Promise.all([user("Admin"), user("Ana"), user("Luis")]);
  await db.insert(organizationMembers).values([
    { organizationId: org.id, userId: admin.id, role: "ADMIN" },
    { organizationId: org.id, userId: ana.id, role: "DELEGATE" },
    { organizationId: org.id, userId: luis.id, role: "DELEGATE" },
  ]);
  // Ana's contact, on Ana's account: Luis has no relation to it.
  const contact = await createContact({ organizationId: org.id, actorUserId: ana.id, name: "Marta" });
  const [account] = await db
    .insert(messagingAccounts)
    .values({ organizationId: org.id, delegateId: ana.id, channel: "fake", externalAccountId: `a-${randomUUID()}` })
    .returning();
  const [conversation] = await db
    .insert(conversations)
    .values({ organizationId: org.id, messagingAccountId: account.id, contactId: contact.id, channel: "fake", externalConversationId: `c-${randomUUID()}` })
    .returning();
  const send = async (attachment: MessageAttachment | null, occurredAt = new Date(), body = "[Documento: Pasaporte.pdf]") => {
    const { message } = await insertInboundMessage({
      organizationId: org.id,
      conversation,
      account,
      externalMessageId: `m-${randomUUID()}`,
      body,
      attachment,
      sourceWebhookEventId: (await db.insert(schema.webhookEvents).values({ organizationId: org.id, messagingAccountId: account.id, channel: "fake", rawBody: "{}", headers: {} }).returning())[0].id,
      occurredAt,
    });
    return message!;
  };
  const as = (u: { id: string }, role: "ADMIN" | "DELEGATE" = "DELEGATE"): Member => ({ organizationId: org.id, userId: u.id, role });
  return { org, admin, ana, luis, account, conversation, send, as };
}

const call = (conversationId: string, messageId: string) =>
  GET(new Request("http://x"), { params: Promise.resolve({ id: conversationId, messageId }) });

describe("what a message keeps of a file", () => {
  it("stores a descriptor and the caption, never the file, and re-delivery does not duplicate it", async () => {
    const s = await setup();
    const body = JSON.stringify({
      externalConversationId: `chat-${randomUUID()}`,
      externalMessageId: "msg-dup",
      externalContactId: `p-${randomUUID()}`,
      contactDisplayName: "Persona",
      text: "Mi pasaporte",
      attachment: { kind: "DOCUMENT", mediaId: "media-9", mimeType: "application/pdf", filename: "pasaporte.pdf" },
    });
    for (let delivery = 0; delivery < 2; delivery++) {
      const outcome = await receiveWebhook("fake", s.account.id, body, { "x-fake-signature": "secret" });
      if (outcome.status !== 200) throw new Error("webhook rejected");
      await outcome.process();
    }

    const rows = await db.select().from(messages).where(and(eq(messages.messagingAccountId, s.account.id), eq(messages.externalMessageId, "msg-dup")));
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("Mi pasaporte");
    expect(rows[0].attachment).toEqual({ kind: "DOCUMENT", mediaId: "media-9", mimeType: "application/pdf", filename: "pasaporte.pdf" });
  });

  it("shows the thread a descriptor without the provider's handle, downloadable only while the provider serves it", async () => {
    const s = await setup();
    const fresh = await s.send(passport);
    const old = await s.send(passport, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
    const plain = await s.send(null, new Date(), "Hola");

    const state = await getConversationThreadState(s.org.id, s.as(s.ana), s.conversation.id, { markRead: false });
    const byId = new Map(state!.messages.map((m) => [m.id, m]));
    expect(byId.get(fresh.id)!.attachment).toEqual({ kind: "DOCUMENT", filename: "Pasaporte.pdf", mimeType: "application/pdf", downloadable: true });
    expect(byId.get(old.id)!.attachment?.downloadable).toBe(false);
    expect(byId.get(plain.id)!.attachment).toBeNull();
    expect(JSON.stringify(state)).not.toContain("media-1");
  });
});

describe("download proxy", () => {
  it("needs a session and a well-formed id, and does not reveal other organizations' messages", async () => {
    const s = await setup();
    const message = await s.send(passport);
    expect((await call(s.conversation.id, message.id)).status).toBe(401);

    currentMember = s.as(s.ana);
    expect((await call("nope", message.id)).status).toBe(404);
    expect((await call(s.conversation.id, randomUUID())).status).toBe(404);

    const other = await setup();
    currentMember = other.as(other.admin, "ADMIN");
    expect((await call(s.conversation.id, message.id)).status).toBe(404);
    expect(fake.downloads).toHaveLength(0);
  });

  it("streams the file to the delegate who sees the contact and to an ADMIN, as a safe attachment, and records it", async () => {
    const s = await setup();
    const message = await s.send(passport);

    for (const member of [s.as(s.ana), s.as(s.admin, "ADMIN")]) {
      currentMember = member;
      const response = await call(s.conversation.id, message.id);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Contenido simulado del archivo media-1");
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toContain('attachment; filename="Pasaporte.pdf"');
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    }
    const logged = await db
      .select()
      .from(activities)
      .where(and(eq(activities.organizationId, s.org.id), eq(activities.type, "MESSAGE_MEDIA_DOWNLOADED")));
    expect(logged.map((a) => a.actorUserId).sort()).toEqual([s.ana.id, s.admin.id].sort());
    expect(logged[0].metadata).toMatchObject({ messageId: message.id, kind: "DOCUMENT" });
  });

  it("answers 403 to a delegate with no relation to the contact, without touching the provider", async () => {
    const s = await setup();
    const message = await s.send(passport);
    currentMember = s.as(s.luis);
    const response = await call(s.conversation.id, message.id);
    expect(response.status).toBe(403);
    expect(fake.downloads).toHaveLength(0);
  });

  it("says 410 when the file expired (by age, or because the provider dropped it) and 404 for a message without a file", async () => {
    const s = await setup();
    currentMember = s.as(s.ana);

    const aged = await s.send(passport, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
    const agedResponse = await call(s.conversation.id, aged.id);
    expect(agedResponse.status).toBe(410);
    expect((await agedResponse.json()).error).toBe("EXPIRED");
    expect(fake.downloads).toHaveLength(0);

    const dropped = await s.send({ ...passport, mediaId: "expired-1" });
    expect((await call(s.conversation.id, dropped.id)).status).toBe(410);

    const plain = await s.send(null, new Date(), "Hola");
    expect((await call(s.conversation.id, plain.id)).status).toBe(404);
  });

  it("limits how many downloads a member can start per minute", async () => {
    const s = await setup();
    const message = await s.send(passport);
    currentMember = s.as(s.ana);
    await db.insert(activities).values(
      Array.from({ length: MEDIA_DOWNLOADS_PER_MINUTE }, () => ({
        organizationId: s.org.id,
        actorUserId: s.ana.id,
        type: "MESSAGE_MEDIA_DOWNLOADED",
        entityType: "conversation",
        entityId: s.conversation.id,
      })),
    );
    const response = await call(s.conversation.id, message.id);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(fake.downloads).toHaveLength(0);

    // Someone else is not affected.
    currentMember = s.as(s.admin, "ADMIN");
    expect((await call(s.conversation.id, message.id)).status).toBe(200);
  });

  it("writes the file nowhere: no file API is used and the only database write is the audit entry", async () => {
    const s = await setup();
    const message = await s.send(passport);
    currentMember = s.as(s.ana);
    const spies = [
      vi.spyOn(fs, "writeFile"),
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs, "createWriteStream"),
      vi.spyOn(fs, "appendFile"),
      vi.spyOn(fsp, "writeFile"),
      vi.spyOn(fsp, "appendFile"),
    ];
    const before = {
      messages: (await db.select().from(messages).where(eq(messages.organizationId, s.org.id))).length,
      events: (await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.organizationId, s.org.id))).length,
    };

    const response = await call(s.conversation.id, message.id);
    expect(await response.text()).toContain("Contenido simulado");

    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect((await db.select().from(messages).where(eq(messages.organizationId, s.org.id))).length).toBe(before.messages);
    expect((await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.organizationId, s.org.id))).length).toBe(before.events);
    const stored = JSON.stringify(await db.select().from(messages).where(eq(messages.id, message.id)));
    expect(stored).not.toContain("Contenido simulado");
  });
});
