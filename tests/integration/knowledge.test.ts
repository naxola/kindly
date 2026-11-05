import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { organizations } from "@/modules/organizations/schema";
import { documents, documentVersions, knowledgeChunks } from "@/modules/knowledge/schema";
import {
  createDocument,
  createDocumentVersion,
  getDocumentWithVersions,
  listDocumentsForOrganization,
  listKnowledgeSources,
} from "@/modules/knowledge/service";
import { knowledgeVisibilityCondition } from "@/modules/knowledge/visibility";
import {
  registerEmbeddingProvider,
  clearEmbeddingProvider,
} from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";

/**
 * Integration tests for the Knowledge data layer (Fase 7a) against real
 * PostgreSQL + pgvector — same harness as `memberships.test.ts`. A fake
 * `EmbeddingProvider` is registered so the write path can embed chunks.
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const provider = createFakeEmbeddingProvider();

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations"),
  });
  registerEmbeddingProvider(provider);
});

afterAll(async () => {
  clearEmbeddingProvider();
  await client.end();
});

async function createOrg(name: string) {
  const [org] = await db
    .insert(organizations)
    .values({ name: `${name}-${randomUUID()}` })
    .returning();
  return org;
}

describe("Knowledge data layer (integration, real PostgreSQL + pgvector)", () => {
  describe("createDocument + visibility invariant", () => {
    it("creates a GLOBAL document with no organization", async () => {
      const doc = await createDocument({
        organizationId: null,
        visibility: "GLOBAL",
        title: "Ley de Extranjería",
      });
      expect(doc.organizationId).toBeNull();
      expect(doc.visibility).toBe("GLOBAL");
    });

    it("creates an ORGANIZATION document owned by its organization", async () => {
      const org = await createOrg("org-doc");
      const doc = await createDocument({
        organizationId: org.id,
        visibility: "ORGANIZATION",
        title: "Protocolo interno de citas",
      });
      expect(doc.organizationId).toBe(org.id);
      expect(doc.visibility).toBe("ORGANIZATION");
    });

    it("rejects GLOBAL with an organization, and ORGANIZATION without one (code-level)", async () => {
      const org = await createOrg("bad-invariant");
      await expect(
        createDocument({ organizationId: org.id, visibility: "GLOBAL", title: "x" }),
      ).rejects.toThrow();
      await expect(
        createDocument({ organizationId: null, visibility: "ORGANIZATION", title: "x" }),
      ).rejects.toThrow();
    });

    it("enforces the GLOBAL⟺null-org invariant at the database (CHECK), bypassing the service", async () => {
      const org = await createOrg("db-check");
      await expect(
        db.insert(documents).values({
          organizationId: org.id,
          visibility: "GLOBAL",
          title: "sneaky",
        }),
      ).rejects.toThrow();
    });
  });

  describe("listDocumentsForOrganization", () => {
    it("returns GLOBAL + own, never another organization's private knowledge", async () => {
      const orgA = await createOrg("tenant-a");
      const orgB = await createOrg("tenant-b");

      const global = await createDocument({
        organizationId: null,
        visibility: "GLOBAL",
        title: "Reglamento estatal",
      });
      const ownA = await createDocument({
        organizationId: orgA.id,
        visibility: "ORGANIZATION",
        title: "Manual de A",
      });
      const privateB = await createDocument({
        organizationId: orgB.id,
        visibility: "ORGANIZATION",
        title: "Manual de B",
      });

      const visibleToA = await listDocumentsForOrganization(orgA.id);
      const ids = visibleToA.map((d) => d.id);

      expect(ids).toContain(global.id);
      expect(ids).toContain(ownA.id);
      expect(ids).not.toContain(privateB.id);
    });
  });

  describe("getDocumentWithVersions", () => {
    it("returns a GLOBAL document to any organization but not another org's private one", async () => {
      const orgA = await createOrg("reader-a");
      const orgB = await createOrg("reader-b");
      const global = await createDocument({
        organizationId: null,
        visibility: "GLOBAL",
        title: "Guía oficial",
      });
      const privateB = await createDocument({
        organizationId: orgB.id,
        visibility: "ORGANIZATION",
        title: "Privado de B",
      });

      expect(await getDocumentWithVersions(global.id, orgA.id)).not.toBeNull();
      expect(await getDocumentWithVersions(privateB.id, orgA.id)).toBeNull();
    });
  });

  describe("createDocumentVersion", () => {
    it("inserts a version with embedded chunks carrying the parent's org/visibility", async () => {
      const org = await createOrg("chunks");
      const doc = await createDocument({
        organizationId: org.id,
        visibility: "ORGANIZATION",
        title: "Doc con chunks",
      });

      const version = await createDocumentVersion({
        documentId: doc.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [
          { ordinal: 0, level: "ARTICLE", label: "Art. 1", content: "primer artículo del documento" },
          { ordinal: 1, level: "ARTICLE", label: "Art. 2", content: "segundo artículo del documento" },
        ],
      });

      const rows = await db
        .select()
        .from(knowledgeChunks)
        .where(eq(knowledgeChunks.documentVersionId, version.id));

      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.organizationId).toBe(org.id);
        expect(row.visibility).toBe("ORGANIZATION");
        expect(row.documentId).toBe(doc.id);
        expect(row.embedding).toHaveLength(1536);
      }
    });

    it("supersedes the document's previous CURRENT version when a new CURRENT is added", async () => {
      const doc = await createDocument({
        organizationId: null,
        visibility: "GLOBAL",
        title: "Norma versionada",
      });

      const first = await createDocumentVersion({
        documentId: doc.id,
        version: "2018",
        status: "CURRENT",
        effectiveFrom: "2018-01-01",
        chunks: [],
      });
      const second = await createDocumentVersion({
        documentId: doc.id,
        version: "2024",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [],
      });

      const [firstAfter] = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, first.id));
      const [secondAfter] = await db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.id, second.id));

      expect(firstAfter.status).toBe("SUPERSEDED");
      expect(secondAfter.status).toBe("CURRENT");
    });

    it("retrieves the nearest chunk by cosine distance and isolates it per tenant", async () => {
      const orgA = await createOrg("retrieval-a");
      const orgB = await createOrg("retrieval-b");

      const docA = await createDocument({
        organizationId: orgA.id,
        visibility: "ORGANIZATION",
        title: "A",
      });
      const target = "requisitos para la renovación del permiso de residencia";
      const versionA = await createDocumentVersion({
        documentId: docA.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [
          { ordinal: 0, content: "horario de atención al público en verano" },
          { ordinal: 1, content: target },
          { ordinal: 2, content: "tasas administrativas y formas de pago" },
        ],
      });

      const docB = await createDocument({
        organizationId: orgB.id,
        visibility: "ORGANIZATION",
        title: "B",
      });
      await createDocumentVersion({
        documentId: docB.id,
        version: "1.0",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [{ ordinal: 0, content: target }],
      });

      const [queryVec] = await provider.embed([target]);
      const literal = `[${queryVec.join(",")}]`;

      // Hard filter (tenancy/visibility) BEFORE semantic ranking — org A sees
      // its own chunks + GLOBAL, never org B's, even though B has an
      // identical, equally-near chunk.
      const nearest = await db
        .select({
          id: knowledgeChunks.id,
          content: knowledgeChunks.content,
          documentId: knowledgeChunks.documentId,
        })
        .from(knowledgeChunks)
        .where(
          knowledgeVisibilityCondition(orgA.id, {
            visibility: knowledgeChunks.visibility,
            organizationId: knowledgeChunks.organizationId,
          }),
        )
        .orderBy(sql`${knowledgeChunks.embedding} <=> ${literal}::vector`)
        .limit(1);

      expect(nearest).toHaveLength(1);
      expect(nearest[0].content).toBe(target);
      expect(nearest[0].documentId).toBe(docA.id);

      // And a direct isolation check: none of org B's chunks are visible to A.
      const visibleToA = await db
        .select({ documentId: knowledgeChunks.documentId })
        .from(knowledgeChunks)
        .where(
          and(
            eq(knowledgeChunks.documentVersionId, versionA.id),
            knowledgeVisibilityCondition(orgA.id, {
              visibility: knowledgeChunks.visibility,
              organizationId: knowledgeChunks.organizationId,
            }),
          ),
        );
      expect(visibleToA.every((r) => r.documentId === docA.id)).toBe(true);
    });
  });
  describe("listKnowledgeSources", () => {
    it("counts chunks and characters, flags other-model chunks as stale, and keeps tenancy", async () => {
      const orgA = await createOrg("sources-a");
      const orgB = await createOrg("sources-b");
      const own = await createDocument({ organizationId: orgA.id, visibility: "ORGANIZATION", title: "Propio" });
      const empty = await createDocument({ organizationId: orgA.id, visibility: "ORGANIZATION", title: "Sin versión" });
      const foreign = await createDocument({ organizationId: orgB.id, visibility: "ORGANIZATION", title: "Ajeno" });
      const version = await createDocumentVersion({
        documentId: own.id,
        version: "1",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [
          { ordinal: 0, level: "ARTICLE", label: "Art. 1", content: "12345" },
          { ordinal: 1, level: "ARTICLE", label: "Art. 2", content: "1234567" },
        ],
      });
      await createDocumentVersion({
        documentId: foreign.id,
        version: "1",
        status: "CURRENT",
        effectiveFrom: "2024-01-01",
        chunks: [{ ordinal: 0, level: "ARTICLE", label: "Art. 1", content: "secreto de la otra organización" }],
      });

      const current = await listKnowledgeSources(orgA.id, provider.id);
      const ownRow = current.find((row) => row.id === own.id)!;
      expect(ownRow).toMatchObject({ chunkCount: 2, characterCount: 12, staleChunkCount: 0 });
      expect(current.find((row) => row.id === empty.id)).toMatchObject({ chunkCount: 0, characterCount: 0, staleChunkCount: 0 });
      expect(current.map((row) => row.id)).not.toContain(foreign.id);

      await db.update(knowledgeChunks).set({ embeddingModel: "legacy" }).where(
        and(eq(knowledgeChunks.documentVersionId, version.id), eq(knowledgeChunks.ordinal, 0)),
      );
      const afterSwitch = await listKnowledgeSources(orgA.id, provider.id);
      expect(afterSwitch.find((row) => row.id === own.id)).toMatchObject({ chunkCount: 2, staleChunkCount: 1 });

      const noProvider = await listKnowledgeSources(orgA.id, null);
      expect(noProvider.find((row) => row.id === own.id)).toMatchObject({ chunkCount: 2, staleChunkCount: 0 });
    });
  });
});
