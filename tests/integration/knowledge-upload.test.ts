import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";
import { documents, documentVersions, knowledgeChunks } from "@/modules/knowledge/schema";
import { createDocument } from "@/modules/knowledge/service";
import { uploadKnowledgeDocument, uploadKnowledgeVersion, UploadError } from "@/modules/knowledge/upload";
import { clearEmbeddingProvider, registerEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";
import type { VersionFields } from "@/modules/knowledge/ingestion/upload-validation";

/** Integration tests for the Knowledge upload orchestration (Fase 7f). */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations") });
  registerEmbeddingProvider(createFakeEmbeddingProvider());
});

afterAll(async () => {
  clearEmbeddingProvider();
  await client.end();
});

async function setup() {
  const [org] = await db.insert(organizations).values({ name: `org-up-${randomUUID()}` }).returning();
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name: "Admin", email: `${randomUUID()}@example.com`, emailVerified: true })
    .returning();
  return { org, user };
}

const fields = (over: Partial<VersionFields> = {}): VersionFields => ({
  version: "1",
  status: "CURRENT",
  effectiveFrom: "2024-01-01",
  effectiveUntil: null,
  sourceNote: "BOE núm. 5",
  origin: "TEXT",
  file: null,
  url: "",
  ...over,
});

const docFields = (title: string) => ({ title, jurisdiction: "ES", territory: null, scope: null });

describe("uploadKnowledgeDocument / uploadKnowledgeVersion", () => {
  it("creates an ORGANIZATION document (never GLOBAL) with embedded chunks", async () => {
    const { org, user } = await setup();
    const document = await uploadKnowledgeDocument({
      organizationId: org.id,
      actorUserId: user.id,
      document: docFields("Protocolo"),
      fields: fields(),
      source: { type: "TEXT", text: "Artículo 1. Texto del protocolo." },
    });

    expect(document.visibility).toBe("ORGANIZATION");
    expect(document.organizationId).toBe(org.id);
    expect(document.sourceType).toBe("MANUAL");
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, document.id));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.organizationId === org.id && c.visibility === "ORGANIZATION")).toBe(true);
  });

  it("refuses an empty extraction with a user-facing error and leaves nothing behind", async () => {
    const { org, user } = await setup();
    const title = `Vacío ${randomUUID()}`;
    await expect(
      uploadKnowledgeDocument({
        organizationId: org.id,
        actorUserId: user.id,
        document: docFields(title),
        fields: fields(),
        source: { type: "TEXT", text: "   \n  " },
      }),
    ).rejects.toBeInstanceOf(UploadError);
    expect(await db.select().from(documents).where(eq(documents.title, title))).toHaveLength(0);
  });

  it("refuses a document that would need too many chunks", async () => {
    const { org, user } = await setup();
    const text = Array.from({ length: 450 }, (_, i) => `Artículo ${i + 1}. ${"palabra ".repeat(20)}`).join("\n");
    await expect(
      uploadKnowledgeDocument({
        organizationId: org.id,
        actorUserId: user.id,
        document: docFields("Enorme"),
        fields: fields(),
        source: { type: "TEXT", text },
      }),
    ).rejects.toThrow(/demasiado largo/);
  });

  it("cleans up the new document if persisting the version fails", async () => {
    const { org, user } = await setup();
    const title = `Fallo ${randomUUID()}`;
    await expect(
      uploadKnowledgeDocument({
        organizationId: org.id,
        actorUserId: user.id,
        document: docFields(title),
        // An impossible date makes the INSERT fail after the document exists.
        fields: fields({ effectiveFrom: "2024-13-45" }),
        source: { type: "TEXT", text: "Artículo 1. Algo." },
      }),
    ).rejects.toThrow();
    expect(await db.select().from(documents).where(eq(documents.title, title))).toHaveLength(0);
  });

  it("reports a friendly error when no EmbeddingProvider is registered", async () => {
    const { org, user } = await setup();
    clearEmbeddingProvider();
    try {
      await expect(
        uploadKnowledgeDocument({
          organizationId: org.id,
          actorUserId: user.id,
          document: docFields("Sin embeddings"),
          fields: fields(),
          source: { type: "TEXT", text: "Artículo 1. Algo." },
        }),
      ).rejects.toThrow(/embeddings/);
    } finally {
      registerEmbeddingProvider(createFakeEmbeddingProvider());
    }
  });

  it("adds a version to its own document, superseding the previous CURRENT", async () => {
    const { org, user } = await setup();
    const document = await uploadKnowledgeDocument({
      organizationId: org.id,
      actorUserId: user.id,
      document: docFields("Con versiones"),
      fields: fields({ version: "1" }),
      source: { type: "TEXT", text: "Artículo 1. Original." },
    });
    await uploadKnowledgeVersion({
      organizationId: org.id,
      actorUserId: user.id,
      documentId: document.id,
      fields: fields({ version: "2", effectiveFrom: "2025-01-01" }),
      source: { type: "TEXT", text: "Artículo 1. Nueva." },
    });

    const versions = await db.select().from(documentVersions).where(eq(documentVersions.documentId, document.id));
    expect(versions.map((v) => [v.version, v.status]).sort()).toEqual([
      ["1", "SUPERSEDED"],
      ["2", "CURRENT"],
    ]);
  });

  it("never adds a version to another organization's document or to a GLOBAL one", async () => {
    const a = await setup();
    const b = await setup();
    const docOfA = await uploadKnowledgeDocument({
      organizationId: a.org.id,
      actorUserId: a.user.id,
      document: docFields("De A"),
      fields: fields(),
      source: { type: "TEXT", text: "Artículo 1. Privado." },
    });
    const global = await createDocument({ organizationId: null, visibility: "GLOBAL", title: `Global ${randomUUID()}` });

    for (const documentId of [docOfA.id, global.id]) {
      await expect(
        uploadKnowledgeVersion({
          organizationId: b.org.id,
          actorUserId: b.user.id,
          documentId,
          fields: fields({ version: "9" }),
          source: { type: "TEXT", text: "Artículo 1. Intruso." },
        }),
      ).rejects.toBeInstanceOf(UploadError);
    }
    // A's own admin cannot version a GLOBAL document either.
    await expect(
      uploadKnowledgeVersion({
        organizationId: a.org.id,
        actorUserId: a.user.id,
        documentId: global.id,
        fields: fields({ version: "9" }),
        source: { type: "TEXT", text: "Artículo 1. Intruso." },
      }),
    ).rejects.toBeInstanceOf(UploadError);
    expect(await db.select().from(documentVersions).where(eq(documentVersions.documentId, global.id))).toHaveLength(0);
  });
});
