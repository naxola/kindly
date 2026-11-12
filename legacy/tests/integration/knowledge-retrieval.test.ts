import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { organizations } from "@/modules/organizations/schema";
import { createDocument, createDocumentVersion } from "@/modules/knowledge/service";
import { retrieveKnowledge } from "@/modules/knowledge/retrieval";
import {
  registerEmbeddingProvider,
  clearEmbeddingProvider,
} from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";

/**
 * Integration tests for hybrid retrieval (Fase 7c) against real PostgreSQL
 * + pgvector — same harness as 7a/7b. The fake `EmbeddingProvider` is a
 * deterministic bag-of-words hash (shared words → closer vectors), enough
 * to exercise real FTS + real pgvector cosine search end to end.
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
  registerEmbeddingProvider(createFakeEmbeddingProvider());
});

afterAll(async () => {
  clearEmbeddingProvider();
  await client.end();
});

async function createOrg(name: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${name}-${Math.random().toString(36).slice(2)}` })
    .returning();
  return org;
}

async function createGlobalDoc(title: string, opts: Partial<Parameters<typeof createDocument>[0]> = {}) {
  return createDocument({ organizationId: null, visibility: "GLOBAL", title, ...opts });
}

async function createOrgDoc(organizationId: string, title: string) {
  return createDocument({ organizationId, visibility: "ORGANIZATION", title });
}

describe("retrieveKnowledge (integration, real PostgreSQL + pgvector)", () => {
  describe("tenancy hard filter", () => {
    it("never returns another organization's private chunk, but always returns GLOBAL chunks", async () => {
      const orgA = await createOrg("org-a");
      const orgB = await createOrg("org-b");

      const docA = await createOrgDoc(orgA.id, "Manual interno A");
      await createDocumentVersion({
        documentId: docA.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [{ ordinal: 0, content: "protocolotenancy contenido de organizacion A" }],
      });

      const docB = await createOrgDoc(orgB.id, "Manual interno B");
      await createDocumentVersion({
        documentId: docB.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [{ ordinal: 0, content: "protocolotenancy contenido de organizacion B" }],
      });

      const globalDoc = await createGlobalDoc("Guía pública tenancy");
      await createDocumentVersion({
        documentId: globalDoc.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [{ ordinal: 0, content: "protocolotenancy contenido global" }],
      });

      const results = await retrieveKnowledge({ organizationId: orgA.id, query: "protocolotenancy" });

      expect(results.some((r) => r.documentId === docA.id)).toBe(true);
      expect(results.some((r) => r.documentId === docB.id)).toBe(false);
      expect(results.some((r) => r.documentId === globalDoc.id)).toBe(true);
    });
  });

  describe("vigencia hard filter (version-aware retrieval)", () => {
    it("excludes DRAFT and REPEALED regardless of atDate", async () => {
      const org = await createOrg("org-vigencia-draft");
      const doc = await createGlobalDoc("Norma en borrador");
      await createDocumentVersion({
        documentId: doc.id,
        version: "0.1",
        status: "DRAFT",
        effectiveFrom: "2020-01-01",
        chunks: [{ ordinal: 0, content: "palabraborradorunica texto en preparación" }],
      });
      const doc2 = await createGlobalDoc("Norma derogada");
      await createDocumentVersion({
        documentId: doc2.id,
        version: "1.0",
        status: "REPEALED",
        effectiveFrom: "2020-01-01",
        chunks: [{ ordinal: 0, content: "palabraderogadaunica texto derogado" }],
      });

      // Vector search always returns the nearest candidates among what
      // passes the hard filters, with no relevance floor — so the result
      // list isn't empty (other fixtures' chunks are still the "closest"
      // available), but the excluded documents must never be among them.
      const draftResults = await retrieveKnowledge({ organizationId: org.id, query: "palabraborradorunica" });
      const repealedResults = await retrieveKnowledge({ organizationId: org.id, query: "palabraderogadaunica" });

      expect(draftResults.some((r) => r.documentId === doc.id)).toBe(false);
      expect(repealedResults.some((r) => r.documentId === doc2.id)).toBe(false);
    });

    it("returns a SUPERSEDED version only for a date inside its own effective window", async () => {
      const org = await createOrg("org-vigencia-superseded");
      const doc = await createGlobalDoc("Norma que cambió");

      const oldVersion = await createDocumentVersion({
        documentId: doc.id,
        version: "1.0",
        status: "SUPERSEDED",
        effectiveFrom: "2018-01-01",
        effectiveUntil: "2019-12-31",
        chunks: [{ ordinal: 0, content: "palabraviejaunica texto de la versión vieja" }],
      });
      const newVersion = await createDocumentVersion({
        documentId: doc.id,
        version: "2.0",
        status: "CURRENT",
        effectiveFrom: "2020-01-01",
        chunks: [{ ordinal: 0, content: "palabranuevaunica texto de la versión nueva" }],
      });

      const oldWithinRange = await retrieveKnowledge({
        organizationId: org.id,
        query: "palabraviejaunica",
        atDate: "2019-06-01",
      });
      const oldOutsideRange = await retrieveKnowledge({
        organizationId: org.id,
        query: "palabraviejaunica",
        atDate: "2025-01-01",
      });
      const newWithinRange = await retrieveKnowledge({
        organizationId: org.id,
        query: "palabranuevaunica",
        atDate: "2025-01-01",
      });
      const newBeforeItExisted = await retrieveKnowledge({
        organizationId: org.id,
        query: "palabranuevaunica",
        atDate: "2019-06-01",
      });

      expect(oldWithinRange.some((r) => r.documentVersionId === oldVersion.id)).toBe(true);
      expect(oldOutsideRange.some((r) => r.documentVersionId === oldVersion.id)).toBe(false);
      expect(newWithinRange.some((r) => r.documentVersionId === newVersion.id)).toBe(true);
      expect(newBeforeItExisted.some((r) => r.documentVersionId === newVersion.id)).toBe(false);
    });
  });

  describe("jurisdiction/territory/scope filter", () => {
    it("restricts to the given jurisdiction when provided, and includes every jurisdiction when omitted", async () => {
      const org = await createOrg("org-jurisdiccion");
      // Unique per run, not just "ES"/"FR": `kindly_test` is never truncated
      // between test runs (docker/init-test-db.sh only creates it once), so
      // a fixed jurisdiction value would accumulate matching GLOBAL
      // documents across every past run of this file and break the
      // `.every(...)` assertion below.
      const suffix = randomUUID();
      const query = `jurisdiccionunica${suffix}`;
      const docEs = await createGlobalDoc("Norma española", { jurisdiction: `ES-${suffix}` });
      await createDocumentVersion({
        documentId: docEs.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [{ ordinal: 0, content: `${query} texto español` }],
      });
      const docFr = await createGlobalDoc("Norma francesa", { jurisdiction: `FR-${suffix}` });
      await createDocumentVersion({
        documentId: docFr.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [{ ordinal: 0, content: `${query} texto francés` }],
      });

      const filtered = await retrieveKnowledge({ organizationId: org.id, query, jurisdiction: `ES-${suffix}` });
      const unfiltered = await retrieveKnowledge({ organizationId: org.id, query });

      expect(filtered.every((r) => r.documentId === docEs.id)).toBe(true);
      expect(filtered.some((r) => r.documentId === docFr.id)).toBe(false);
      expect(unfiltered.some((r) => r.documentId === docEs.id)).toBe(true);
      expect(unfiltered.some((r) => r.documentId === docFr.id)).toBe(true);
    });
  });

  describe("result shape and limit", () => {
    it("carries every field a citation needs", async () => {
      const org = await createOrg("org-forma");
      const doc = await createGlobalDoc("Ley con nota de cita", {
        jurisdiction: "ES",
        territory: "Nacional",
        scope: "Extranjería",
        sourceUrl: "https://boe.es/ejemplo",
      });
      await createDocumentVersion({
        documentId: doc.id,
        version: "3.1",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        source: "BOE núm. 5, de 2024-01-10",
        chunks: [{ ordinal: 0, level: "ARTICLE", label: "Artículo 9", path: "Capítulo I > Artículo 9", content: "formaunicacitable contenido citable" }],
      });

      const [result] = await retrieveKnowledge({ organizationId: org.id, query: "formaunicacitable" });

      expect(result).toMatchObject({
        documentTitle: "Ley con nota de cita",
        documentSourceUrl: "https://boe.es/ejemplo",
        version: "3.1",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        jurisdiction: "ES",
        territory: "Nacional",
        scope: "Extranjería",
        sourceNote: "BOE núm. 5, de 2024-01-10",
        level: "ARTICLE",
        label: "Artículo 9",
        path: "Capítulo I > Artículo 9",
        content: "formaunicacitable contenido citable",
      });
      expect(typeof result.score).toBe("number");
    });

    it("respects the limit even with more matching candidates", async () => {
      const org = await createOrg("org-limite");
      const doc = await createGlobalDoc("Documento con muchos artículos");
      await createDocumentVersion({
        documentId: doc.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: Array.from({ length: 10 }, (_, i) => ({
          ordinal: i,
          content: `limiteunicaquery artículo número ${i}`,
        })),
      });

      const results = await retrieveKnowledge({ organizationId: org.id, query: "limiteunicaquery", limit: 3 });

      expect(results).toHaveLength(3);
    });
  });
});
