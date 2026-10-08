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
import { documents, knowledgeChunks, knowledgeImportPages, type ImportPageOptions } from "@/modules/knowledge/schema";
import {
  createImportBatch,
  getImportBatch,
  listRecentImportBatches,
  MAX_BATCH_PAGES,
  processImportBatch,
  retryFailedImportPages,
} from "@/modules/knowledge/site-import";
import { UploadError, uploadKnowledgeDocument } from "@/modules/knowledge/upload";
import { clearEmbeddingProvider, registerEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";

/** Integration tests for the bulk web import (knowledge step 2). No network: pages come from an injected fetcher. */

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
  const [org] = await db.insert(organizations).values({ name: `org-imp-${randomUUID()}` }).returning();
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name: "Admin", email: `${randomUUID()}@example.com`, emailVerified: true })
    .returning();
  return { org, user };
}

const options: ImportPageOptions = {
  version: "2024",
  status: "CURRENT",
  effectiveFrom: "2024-01-01",
  effectiveUntil: null,
  sourceNote: "Web oficial",
  jurisdiction: "ES",
  territory: null,
  scope: null,
};

const SITE = "https://example.org/";
const fastProcess = { pauseMs: 0 };

/** Every page answers with its own text, except the URLs listed in `broken`. */
const fetcher = (broken: string[] = []) =>
  (async (url: string) => {
    if (broken.includes(url)) throw new Error("boom");
    return { title: `Título de ${new URL(url).pathname}`, text: `Contenido único de ${url}. Párrafo con texto suficiente.` };
  }) as never;

describe("createImportBatch", () => {
  it("queues the chosen pages of the site, deduplicated and normalized, ignoring other hosts", async () => {
    const { org, user } = await setup();
    const result = await createImportBatch({
      organizationId: org.id,
      actorUserId: user.id,
      siteUrl: SITE,
      pages: [
        { url: "https://example.org/a/", title: "A" },
        { url: "https://example.org/a#top", title: null },
        { url: "https://otro.org/b", title: null },
        { url: "https://example.org/b", title: null },
      ],
      options,
    });
    expect(result).toMatchObject({ queued: 2, skipped: 0 });
    const rows = await getImportBatch(org.id, result.batchId);
    expect(rows.map((r) => r.url).sort()).toEqual(["https://example.org/a", "https://example.org/b"]);
    expect(rows.every((r) => r.status === "PENDING" && r.createdBy === user.id)).toBe(true);
  });

  it("skips pages the organization already has as a document or is already importing", async () => {
    const { org, user } = await setup();
    const existing = await uploadKnowledgeDocument({
      organizationId: org.id,
      actorUserId: user.id,
      document: { title: "Ya la tengo", jurisdiction: null, territory: null, scope: null },
      fields: { ...options, origin: "WEB", file: null, url: "https://example.org/ya" },
      source: { type: "WEB", url: "https://example.org/ya", text: "Texto de la página que ya existe." },
    });
    await createImportBatch({
      organizationId: org.id,
      actorUserId: user.id,
      siteUrl: SITE,
      pages: [{ url: "https://example.org/en-curso", title: null }],
      options,
    });

    const second = await createImportBatch({
      organizationId: org.id,
      actorUserId: user.id,
      siteUrl: SITE,
      pages: [
        { url: "https://example.org/ya/", title: null },
        { url: "https://example.org/en-curso", title: null },
        { url: "https://example.org/nueva", title: null },
      ],
      options,
    });
    expect(second).toMatchObject({ queued: 1, skipped: 2 });
    const rows = await getImportBatch(org.id, second.batchId);
    const skipped = rows.find((r) => r.url === "https://example.org/ya")!;
    expect(skipped).toMatchObject({ status: "SKIPPED", documentId: existing.id, error: "Ya estaba añadida." });
    expect(rows.find((r) => r.url === "https://example.org/en-curso")).toMatchObject({ status: "SKIPPED" });
  });

  it("refuses an empty selection and more than the batch limit", async () => {
    const { org, user } = await setup();
    const base = { organizationId: org.id, actorUserId: user.id, siteUrl: SITE, options };
    await expect(createImportBatch({ ...base, pages: [] })).rejects.toThrow(UploadError);
    await expect(createImportBatch({ ...base, pages: [{ url: "https://otro.org/x", title: null }] })).rejects.toThrow(UploadError);
    const many = Array.from({ length: MAX_BATCH_PAGES + 1 }, (_, i) => ({ url: `https://example.org/p${i}`, title: null }));
    await expect(createImportBatch({ ...base, pages: many })).rejects.toThrow(/como máximo/);
  });
});

describe("processImportBatch", () => {
  it("indexes every page as an ORGANIZATION document with its own title, version and chunks", async () => {
    const { org, user } = await setup();
    const { batchId } = await createImportBatch({
      organizationId: org.id,
      actorUserId: user.id,
      siteUrl: SITE,
      pages: [{ url: "https://example.org/uno", title: null }, { url: "https://example.org/dos", title: null }],
      options,
    });

    const result = await processImportBatch(org.id, batchId, { ...fastProcess, fetchPage: fetcher() });
    expect(result).toEqual({ processed: 2, remaining: 0 });

    const rows = await getImportBatch(org.id, batchId);
    expect(rows.every((r) => r.status === "INDEXED" && r.documentId && r.error === null)).toBe(true);
    const [doc] = await db.select().from(documents).where(eq(documents.id, rows[0].documentId!));
    expect(doc).toMatchObject({
      organizationId: org.id,
      visibility: "ORGANIZATION",
      sourceType: "WEB",
      sourceUrl: rows[0].url,
      title: `Título de ${new URL(rows[0].url).pathname}`,
      jurisdiction: "ES",
    });
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc.id));
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("marks a failing page FAILED with a user-facing message and carries on with the rest", async () => {
    const { org, user } = await setup();
    const { batchId } = await createImportBatch({
      organizationId: org.id,
      actorUserId: user.id,
      siteUrl: SITE,
      pages: [{ url: "https://example.org/rota", title: null }, { url: "https://example.org/buena", title: null }],
      options,
    });

    await processImportBatch(org.id, batchId, { ...fastProcess, fetchPage: fetcher(["https://example.org/rota"]) });
    const rows = await getImportBatch(org.id, batchId);
    const broken = rows.find((r) => r.url.endsWith("/rota"))!;
    expect(broken.status).toBe("FAILED");
    expect(broken.error).toMatch(/No se pudo descargar la página/);
    expect(broken.error).not.toMatch(/boom/);
    expect(rows.find((r) => r.url.endsWith("/buena"))!.status).toBe("INDEXED");

    // Retry: the page goes back to PENDING and, once the site answers, gets indexed.
    expect(await retryFailedImportPages(org.id, batchId)).toBe(1);
    await processImportBatch(org.id, batchId, { ...fastProcess, fetchPage: fetcher() });
    expect((await getImportBatch(org.id, batchId)).every((r) => r.status === "INDEXED")).toBe(true);
  });

  it("stops after its time budget and leaves the rest PENDING for the next slice", async () => {
    const { org, user } = await setup();
    const { batchId } = await createImportBatch({
      organizationId: org.id,
      actorUserId: user.id,
      siteUrl: SITE,
      pages: ["a", "b", "c"].map((p) => ({ url: `https://example.org/${p}`, title: null })),
      options,
    });
    const first = await processImportBatch(org.id, batchId, { pauseMs: 0, budgetMs: 0, fetchPage: fetcher() });
    expect(first).toEqual({ processed: 0, remaining: 3 });
    const second = await processImportBatch(org.id, batchId, { ...fastProcess, fetchPage: fetcher() });
    expect(second).toEqual({ processed: 3, remaining: 0 });
  });

  it("takes over a page left INDEXING by a crashed slice, but not a fresh claim", async () => {
    const { org, user } = await setup();
    const { batchId } = await createImportBatch({
      organizationId: org.id,
      actorUserId: user.id,
      siteUrl: SITE,
      pages: [{ url: "https://example.org/colgada", title: null }],
      options,
    });
    const [row] = await getImportBatch(org.id, batchId);

    await db.update(knowledgeImportPages).set({ status: "INDEXING", startedAt: new Date() }).where(eq(knowledgeImportPages.id, row.id));
    expect(await processImportBatch(org.id, batchId, { ...fastProcess, fetchPage: fetcher() })).toEqual({ processed: 0, remaining: 1 });

    await db
      .update(knowledgeImportPages)
      .set({ startedAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(eq(knowledgeImportPages.id, row.id));
    expect(await processImportBatch(org.id, batchId, { ...fastProcess, fetchPage: fetcher() })).toEqual({ processed: 1, remaining: 0 });
  });

  it("never touches another organization's batch", async () => {
    const a = await setup();
    const b = await setup();
    const { batchId } = await createImportBatch({
      organizationId: a.org.id,
      actorUserId: a.user.id,
      siteUrl: SITE,
      pages: [{ url: "https://example.org/privada", title: null }],
      options,
    });

    expect(await getImportBatch(b.org.id, batchId)).toEqual([]);
    expect(await processImportBatch(b.org.id, batchId, { ...fastProcess, fetchPage: fetcher() })).toEqual({ processed: 0, remaining: 0 });
    expect(await retryFailedImportPages(b.org.id, batchId)).toBe(0);
    expect((await getImportBatch(a.org.id, batchId))[0].status).toBe("PENDING");
  });

  it("refuses to run without an embedding provider", async () => {
    const { org } = await setup();
    clearEmbeddingProvider();
    try {
      await expect(processImportBatch(org.id, randomUUID(), fastProcess)).rejects.toThrow(/embeddings/);
    } finally {
      registerEmbeddingProvider(createFakeEmbeddingProvider());
    }
  });
describe("listRecentImportBatches", () => {
  it("summarizes each batch of the organization, newest first, and no other organization's", async () => {
    const a = await setup();
    const b = await setup();
    const older = await createImportBatch({
      organizationId: a.org.id,
      actorUserId: a.user.id,
      siteUrl: SITE,
      pages: [{ url: "https://example.org/x", title: null }, { url: "https://example.org/y", title: null }],
      options,
    });
    await processImportBatch(a.org.id, older.batchId, { ...fastProcess, fetchPage: fetcher(["https://example.org/y"]) });
    const newer = await createImportBatch({
      organizationId: a.org.id,
      actorUserId: a.user.id,
      siteUrl: SITE,
      pages: [{ url: "https://example.org/z", title: null }],
      options,
    });
    await createImportBatch({
      organizationId: b.org.id,
      actorUserId: b.user.id,
      siteUrl: SITE,
      pages: [{ url: "https://example.org/otra-org", title: null }],
      options,
    });

    const batches = await listRecentImportBatches(a.org.id);
    expect(batches.map((batch) => batch.batchId)).toEqual([newer.batchId, older.batchId]);
    expect(batches[0]).toMatchObject({ total: 1, indexed: 0, failed: 0, open: 1 });
    expect(batches[1]).toMatchObject({ total: 2, indexed: 1, failed: 1, open: 0 });
  });
});
});
