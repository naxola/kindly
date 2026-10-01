import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { documentVersions, knowledgeChunks } from "@/modules/knowledge/schema";
import { createDocument } from "@/modules/knowledge/service";
import { ingestDocumentVersion } from "@/modules/knowledge/ingestion/pipeline";
import {
  registerEmbeddingProvider,
  clearEmbeddingProvider,
} from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";

/**
 * Integration tests for the ingestion pipeline (Fase 7b) against real
 * PostgreSQL + pgvector — same harness as `knowledge.test.ts` (7a). A fake
 * `EmbeddingProvider` is registered; extraction never touches the real
 * network (`--pdf`/`--text-file` read local fixtures, `--url` gets a
 * stubbed `fetchImpl`, `CLAUDE.md` §6).
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const provider = createFakeEmbeddingProvider();
const pdfFixture = new Uint8Array(readFileSync(path.resolve(__dirname, "../fixtures/knowledge/sample.pdf")));

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

async function createGlobalDocument(title: string) {
  return createDocument({ organizationId: null, visibility: "GLOBAL", title });
}

describe("Knowledge ingestion pipeline (integration, real PostgreSQL + pgvector)", () => {
  it("ingests a PDF source into structured, embedded chunks", async () => {
    const document = await createGlobalDocument("Ley de Extranjería (PDF)");

    const version = await ingestDocumentVersion({
      documentId: document.id,
      version: "1.0",
      status: "CURRENT",
      effectiveFrom: "2024-01-01",
      input: { type: "PDF", data: pdfFixture },
    });

    const chunks = await db
      .select()
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentVersionId, version.id));

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Contenido de prueba.");
    expect(chunks[0].label).toBe("Articulo 1");
    expect(chunks[0].level).toBe("ARTICLE");
    // Tenancy denormalized from the parent document, unchanged from 7a.
    expect(chunks[0].organizationId).toBeNull();
    expect(chunks[0].visibility).toBe("GLOBAL");
    // A real (fake) embedding was written, not a placeholder.
    expect(chunks[0].embedding).toHaveLength(1536);
  });

  it("ingests a WEB source via a stubbed fetch, never the real network", async () => {
    const document = await createGlobalDocument("Guía oficial (WEB)");
    const html = "<html><body><p>CAPÍTULO I</p><p>Artículo 1</p><p>Contenido web.</p></body></html>";
    const fetchImpl = (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;

    const version = await ingestDocumentVersion({
      documentId: document.id,
      version: "1.0",
      status: "CURRENT",
      effectiveFrom: "2024-01-01",
      input: { type: "WEB", url: "https://example.org/guia", fetchImpl },
    });

    const chunks = await db
      .select()
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentVersionId, version.id))
      .orderBy(knowledgeChunks.ordinal);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ path: "Capítulo I > Artículo 1", content: "Contenido web.", level: "ARTICLE" });
  });

  it("ingests a TEXT source and preserves hierarchical metadata across versions", async () => {
    const document = await createGlobalDocument("Ley con estructura (TEXT)");
    const text = ["CAPÍTULO I", "Artículo 1", "Primer contenido.", "Artículo 2", "Segundo contenido."].join("\n");

    const version = await ingestDocumentVersion({
      documentId: document.id,
      version: "1.0",
      status: "CURRENT",
      effectiveFrom: "2024-01-01",
      input: { type: "TEXT", text },
    });

    const chunks = await db
      .select()
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.documentVersionId, version.id))
      .orderBy(knowledgeChunks.ordinal);

    // "CAPÍTULO I" has no body of its own before "Artículo 1" follows, so it
    // contributes no separate chunk — only to the breadcrumb of what comes
    // after it (same rule `knowledge-chunking.test.ts` covers directly).
    expect(chunks.map((c) => c.path)).toEqual(["Capítulo I > Artículo 1", "Capítulo I > Artículo 2"]);
    expect(chunks.map((c) => c.level)).toEqual(["ARTICLE", "ARTICLE"]);
  });

  it("superseding a version through the pipeline still closes the previous CURRENT (7a behavior unchanged)", async () => {
    const document = await createGlobalDocument("Ley que se actualiza (TEXT)");

    const v1 = await ingestDocumentVersion({
      documentId: document.id,
      version: "1.0",
      status: "CURRENT",
      effectiveFrom: "2020-01-01",
      effectiveUntil: "2023-12-31",
      input: { type: "TEXT", text: "Artículo 1\nTexto viejo." },
    });
    const v2 = await ingestDocumentVersion({
      documentId: document.id,
      version: "2.0",
      status: "CURRENT",
      effectiveFrom: "2024-01-01",
      input: { type: "TEXT", text: "Artículo 1\nTexto nuevo." },
    });

    const [refreshedV1] = await db.select().from(documentVersions).where(eq(documentVersions.id, v1.id));
    const [refreshedV2] = await db.select().from(documentVersions).where(eq(documentVersions.id, v2.id));
    expect(refreshedV1.status).toBe("SUPERSEDED");
    expect(refreshedV2.status).toBe("CURRENT");
  });

  it("stores a citation-note source string distinct from the content's ingestion source", async () => {
    const document = await createGlobalDocument("Ley con nota de cita (TEXT)");

    const version = await ingestDocumentVersion({
      documentId: document.id,
      version: "1.0",
      status: "CURRENT",
      effectiveFrom: "2024-01-01",
      source: "BOE núm. 5, de 2024-01-10",
      input: { type: "TEXT", text: "Artículo 1\nContenido." },
    });

    const [row] = await db.select().from(documentVersions).where(eq(documentVersions.id, version.id));
    expect(row.source).toBe("BOE núm. 5, de 2024-01-10");
  });
});
