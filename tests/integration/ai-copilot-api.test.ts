import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { conversations, messages } from "@/modules/conversations/schema";
import { messagingAccounts } from "@/modules/messaging/schema";
import { createContact } from "@/modules/contacts/service";
import { clearLLMProvider, registerLLMProvider } from "@/modules/ai/llm-provider";
import { createFakeLLMProvider } from "@/modules/ai/testing/fake-llm-provider";
import { clearEmbeddingProvider, registerEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";

/** The Copilot API routes against real PostgreSQL, with the session mocked. */

let currentMember: { organizationId: string; userId: string; role: "ADMIN" | "DELEGATE" } | null = null;
vi.mock("@/modules/organizations/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/organizations/service")>()),
  getCurrentOrganizationMember: async () => currentMember,
}));

const { GET, POST } = await import("@/app/api/conversations/[id]/copilot/route");
const { POST: RESOLVE } = await import("@/app/api/conversations/[id]/copilot/[suggestionId]/route");

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations") });
});
afterAll(async () => {
  clearLLMProvider();
  clearEmbeddingProvider();
  await client.end();
});
beforeEach(() => {
  currentMember = null;
  registerEmbeddingProvider(createFakeEmbeddingProvider());
  registerLLMProvider(createFakeLLMProvider());
});

async function setup(name: string) {
  const [user] = await db.insert(users).values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` }).returning();
  const [org] = await db.insert(organizations).values({ name: `${name}-${randomUUID()}` }).returning();
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "DELEGATE" });
  const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Marta" });
  const [account] = await db
    .insert(messagingAccounts)
    .values({ organizationId: org.id, delegateId: user.id, channel: "fake", externalAccountId: `a-${randomUUID()}` })
    .returning();
  const [conversation] = await db
    .insert(conversations)
    .values({ organizationId: org.id, messagingAccountId: account.id, contactId: contact.id, channel: "fake", externalConversationId: `c-${randomUUID()}` })
    .returning();
  const add = async (direction: "INBOUND" | "OUTBOUND", body: string) =>
    (
      await db
        .insert(messages)
        .values({ organizationId: org.id, conversationId: conversation.id, messagingAccountId: account.id, externalMessageId: `m-${randomUUID()}`, direction, body })
        .returning()
    )[0];
  return { user, org, conversation, add, member: { organizationId: org.id, userId: user.id, role: "DELEGATE" as const } };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url = "http://x") => new Request(url, { method: "POST" });
const resolveReq = (action: unknown, contentType = "application/json") =>
  new Request("http://x", { method: "POST", headers: { "content-type": contentType }, body: JSON.stringify({ action }) });

describe("Copilot API", () => {
  it("requires a session on every route", async () => {
    const s = await setup("api-auth");
    expect((await GET(post(), ctx(s.conversation.id))).status).toBe(401);
    expect((await POST(post(), ctx(s.conversation.id))).status).toBe(401);
    expect((await RESOLVE(resolveReq("DISCARDED"), { params: Promise.resolve({ id: s.conversation.id, suggestionId: randomUUID() }) })).status).toBe(401);
  });

  it("GET is empty, POST generates (201) and returns the DTO without any model details, GET then returns it", async () => {
    const s = await setup("api-flow");
    currentMember = s.member;
    await s.add("INBOUND", "hola buenas");

    const empty = await (await GET(post(), ctx(s.conversation.id))).json();
    expect(empty).toEqual({ suggestion: null });

    const res = await POST(post(), ctx(s.conversation.id));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.suggestion).toMatchObject({ status: "GENERATED", outcome: "NO_KNOWLEDGE_NEEDED", hasNewerMessage: false });
    const text = JSON.stringify(body);
    for (const forbidden of ["fake-model", "providerId", "contextSnapshot", "systemPrompt", "userPrompt", "retrieval"]) {
      expect(text).not.toContain(forbidden);
    }

    const again = await (await GET(post(), ctx(s.conversation.id))).json();
    expect(again.suggestion.id).toBe(body.suggestion.id);

    await s.add("INBOUND", "otra cosa");
    expect((await (await GET(post(), ctx(s.conversation.id))).json()).suggestion.hasNewerMessage).toBe(true);
  });

  it("answers 429 with Retry-After inside the cooldown, 422 with nothing to answer, 503 without a provider", async () => {
    const s = await setup("api-errors");
    currentMember = s.member;
    expect((await POST(post(), ctx(s.conversation.id))).status).toBe(422);

    await s.add("INBOUND", "hola");
    expect((await POST(post(), ctx(s.conversation.id))).status).toBe(201);
    const limited = await POST(post(), ctx(s.conversation.id));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);

    clearLLMProvider();
    expect((await POST(post(), ctx(s.conversation.id))).status).toBe(503);
  });

  it("hides a conversation from another organization and from a delegate without access (404)", async () => {
    const s = await setup("api-hidden");
    const other = await setup("api-hidden-other");
    await s.add("INBOUND", "hola");
    currentMember = other.member;
    expect((await POST(post(), ctx(s.conversation.id))).status).toBe(404);
    expect(await (await GET(post(), ctx(s.conversation.id))).json()).toEqual({ suggestion: null });
  });

  it("resolves a suggestion as a draft use or a discard, validating the body, and never creates a message", async () => {
    const s = await setup("api-resolve");
    currentMember = s.member;
    await s.add("INBOUND", "hola");
    const { suggestion } = await (await POST(post(), ctx(s.conversation.id))).json();
    const params = { params: Promise.resolve({ id: s.conversation.id, suggestionId: suggestion.id }) };

    expect((await RESOLVE(resolveReq("SEND"), params)).status).toBe(400);
    expect((await RESOLVE(resolveReq("DISCARDED", "text/plain"), params)).status).toBe(415);

    const used = await RESOLVE(resolveReq("USED_AS_DRAFT"), params);
    expect(used.status).toBe(200);
    expect((await used.json()).suggestion.status).toBe("USED_AS_DRAFT");
    expect((await RESOLVE(resolveReq("DISCARDED"), params)).status).toBe(409);

    const all = await db.select().from(messages).where(eq(messages.conversationId, s.conversation.id));
    expect(all).toHaveLength(1);
    expect(all.every((m) => m.direction === "INBOUND")).toBe(true);
  });
});
