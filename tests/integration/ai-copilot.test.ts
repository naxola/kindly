import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { users } from "@/modules/auth/schema";
import { organizationMembers, organizations } from "@/modules/organizations/schema";
import { conversations, messages } from "@/modules/conversations/schema";
import { messagingAccounts } from "@/modules/messaging/schema";
import { aiSuggestions } from "@/modules/ai/schema";
import { createContact } from "@/modules/contacts/service";
import { createDocument, createDocumentVersion } from "@/modules/knowledge/service";
import { clearEmbeddingProvider, registerEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";
import { clearLLMProvider, registerLLMProvider } from "@/modules/ai/llm-provider";
import { createFakeLLMProvider } from "@/modules/ai/testing/fake-llm-provider";
import {
  CopilotError,
  generateSuggestion,
  getLatestSuggestion,
  purgeExpiredSuggestions,
  resolveSuggestion,
} from "@/modules/ai/service";
import { listActivitiesForEntity } from "@/modules/audit/service";
import type { AISuggestion } from "@/modules/ai/domain";

/** Integration tests for the AI Copilot service (Fase 8) against real PostgreSQL, fake LLM and fake embeddings. */

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
  registerEmbeddingProvider(createFakeEmbeddingProvider());
  registerLLMProvider(createFakeLLMProvider());
});

async function setup(name: string) {
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name, email: `${randomUUID()}@example.com` })
    .returning();
  const [org] = await db.insert(organizations).values({ name: `${name}-${randomUUID()}` }).returning();
  await db.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "DELEGATE" });
  const contact = await createContact({ organizationId: org.id, actorUserId: user.id, name: "Marta" });
  const [account] = await db
    .insert(messagingAccounts)
    .values({ organizationId: org.id, delegateId: user.id, channel: "fake", externalAccountId: `a-${randomUUID()}` })
    .returning();
  const [conversation] = await db
    .insert(conversations)
    .values({
      organizationId: org.id,
      messagingAccountId: account.id,
      contactId: contact.id,
      channel: "fake",
      externalConversationId: `c-${randomUUID()}`,
    })
    .returning();
  const member = { userId: user.id, role: "DELEGATE" as const };
  return { user, org, contact, account, conversation, member };
}

async function addMessage(
  s: Awaited<ReturnType<typeof setup>>,
  direction: "INBOUND" | "OUTBOUND",
  body: string,
) {
  const [row] = await db
    .insert(messages)
    .values({
      organizationId: s.org.id,
      conversationId: s.conversation.id,
      messagingAccountId: s.account.id,
      externalMessageId: `m-${randomUUID()}`,
      direction,
      body,
    })
    .returning();
  return row;
}

async function addKnowledge(organizationId: string, content: string): Promise<string> {
  const doc = await createDocument({ organizationId, visibility: "ORGANIZATION", title: "Protocolo de bajas" });
  const version = await createDocumentVersion({
    documentId: doc.id,
    version: "1.0",
    status: "CURRENT",
    effectiveFrom: "2024-01-01",
    chunks: [{ ordinal: 0, content }],
  });
  const [chunk] = await db.select().from(schema.knowledgeChunks).where(eq(schema.knowledgeChunks.documentVersionId, version.id));
  return chunk.id;
}

describe("AI Copilot service (integration)", () => {
  it("generates a suggestion with real citations and records snapshot + activity", async () => {
    const s = await setup("cited");
    const chunkId = await addKnowledge(s.org.id, "bajamedica requisitos para la baja medica en la organizacion");
    const inbound = await addMessage(s, "INBOUND", "bajamedica requisitos");

    const row = await generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id });

    expect(row.status).toBe("GENERATED");
    expect(row.triggerMessageId).toBe(inbound.id);
    expect(row.contextSnapshot.messageIds).toEqual([inbound.id]);
    expect(row.contextSnapshot.retrievedChunkIds).toContain(chunkId);
    expect(row.contextSnapshot.userPrompt).toContain("bajamedica requisitos");
    const suggestion = row.suggestion as AISuggestion;
    expect(suggestion.sources).toHaveLength(1);
    expect(row.contextSnapshot.retrievedChunkIds).toContain(suggestion.sources[0].chunkId);
    expect(suggestion.evidenceLevel).toBe("PARTIAL");
    expect(row.retentionExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const activities = await listActivitiesForEntity(s.org.id, "ai_suggestion", row.id);
    expect(activities.map((a) => a.type)).toEqual(["AI_SUGGESTION_GENERATED"]);
  });

  it("never sends anything: no outbound message is created", async () => {
    const s = await setup("nosend");
    await addMessage(s, "INBOUND", "hola");
    await generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id });
    const rows = await db.select().from(messages).where(eq(messages.conversationId, s.conversation.id));
    expect(rows.every((m) => m.direction === "INBOUND")).toBe(true);
  });

  it("is INSUFFICIENT with no knowledge, and when the model invents a source", async () => {
    const s = await setup("invented");
    await addMessage(s, "INBOUND", "pregunta sin documentacion");
    registerLLMProvider(
      createFakeLLMProvider({
        override: () => ({
          issue: "x",
          suggestedReply: "y",
          evidenceLevel: "SUFFICIENT",
          sourceIds: [randomUUID()],
          warnings: [],
          missingInformation: [],
        }),
      }),
    );
    const row = await generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id });
    const suggestion = row.suggestion as AISuggestion;
    expect(suggestion.sources).toEqual([]);
    expect(suggestion.evidenceLevel).toBe("INSUFFICIENT");
  });

  it("works without an embedding provider (no knowledge offered)", async () => {
    const s = await setup("noembed");
    await addMessage(s, "INBOUND", "hola");
    clearEmbeddingProvider();
    const row = await generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id });
    expect(row.contextSnapshot.knowledgeAvailable).toBe(false);
    expect((row.suggestion as AISuggestion).evidenceLevel).toBe("INSUFFICIENT");
  });

  it("never offers another organization's private knowledge", async () => {
    const a = await setup("tenant-a");
    const b = await setup("tenant-b");
    const foreignChunkId = await addKnowledge(b.org.id, "secretotenant contenido privado de otra organizacion");
    await addMessage(a, "INBOUND", "secretotenant");
    const row = await generateSuggestion({ organizationId: a.org.id, member: a.member, conversationId: a.conversation.id });
    expect(row.contextSnapshot.userPrompt).not.toContain("contenido privado de otra organizacion");
    expect(row.contextSnapshot.retrievedChunkIds).not.toContain(foreignChunkId);
  });

  it("records a FAILED row and throws GENERATION_FAILED when the provider fails", async () => {
    const s = await setup("fail");
    await addMessage(s, "INBOUND", "hola");
    registerLLMProvider(createFakeLLMProvider({ fail: true }));
    await expect(
      generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id }),
    ).rejects.toMatchObject({ code: "GENERATION_FAILED" });
    const latest = await getLatestSuggestion(s.org.id, s.member, s.conversation.id);
    expect(latest?.status).toBe("FAILED");
  });

  it("rejects malformed model output as a failure", async () => {
    const s = await setup("malformed");
    await addMessage(s, "INBOUND", "hola");
    registerLLMProvider(createFakeLLMProvider({ override: () => ({ nope: true }) }));
    await expect(
      generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id }),
    ).rejects.toBeInstanceOf(CopilotError);
  });

  it("has nothing to answer without an inbound message", async () => {
    const s = await setup("empty");
    await addMessage(s, "OUTBOUND", "hola");
    await expect(
      generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id }),
    ).rejects.toMatchObject({ code: "NOTHING_TO_ANSWER" });
  });

  it("hides the conversation from a delegate without access and from another organization", async () => {
    const s = await setup("hidden");
    const other = await setup("other");
    await addMessage(s, "INBOUND", "hola");
    const outsiderDelegate = { userId: other.user.id, role: "DELEGATE" as const };

    await expect(
      generateSuggestion({ organizationId: s.org.id, member: outsiderDelegate, conversationId: s.conversation.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      generateSuggestion({ organizationId: other.org.id, member: other.member, conversationId: s.conversation.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const row = await generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id });
    expect(await getLatestSuggestion(s.org.id, outsiderDelegate, s.conversation.id)).toBeNull();
    await expect(
      resolveSuggestion({ organizationId: s.org.id, member: outsiderDelegate, suggestionId: row.id, action: "DISCARDED" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("resolves a suggestion once (used as draft or discarded) and audits it", async () => {
    const s = await setup("resolve");
    await addMessage(s, "INBOUND", "hola");
    const row = await generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id });

    const used = await resolveSuggestion({
      organizationId: s.org.id,
      member: s.member,
      suggestionId: row.id,
      action: "USED_AS_DRAFT",
    });
    expect(used.status).toBe("USED_AS_DRAFT");
    expect(used.resolvedBy).toBe(s.user.id);

    await expect(
      resolveSuggestion({ organizationId: s.org.id, member: s.member, suggestionId: row.id, action: "DISCARDED" }),
    ).rejects.toMatchObject({ code: "ALREADY_RESOLVED" });

    const activities = await listActivitiesForEntity(s.org.id, "ai_suggestion", row.id);
    expect(activities.map((a) => a.type).sort()).toEqual(["AI_SUGGESTION_GENERATED", "AI_SUGGESTION_USED"]);
  });

  it("purges only rows past their retention deadline", async () => {
    const s = await setup("purge");
    await addMessage(s, "INBOUND", "hola");
    const keep = await generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id });
    const old = await generateSuggestion({ organizationId: s.org.id, member: s.member, conversationId: s.conversation.id });
    await db
      .update(aiSuggestions)
      .set({ retentionExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(aiSuggestions.id, old.id));

    const purged = await purgeExpiredSuggestions();
    expect(purged).toBeGreaterThanOrEqual(1);
    const remaining = await db.select().from(aiSuggestions).where(eq(aiSuggestions.conversationId, s.conversation.id));
    expect(remaining.map((r) => r.id)).toEqual([keep.id]);
  });
});
