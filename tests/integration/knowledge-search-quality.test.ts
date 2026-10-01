import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { knowledgeChunks } from "@/modules/knowledge/schema";
import { createDocument, createDocumentVersion } from "@/modules/knowledge/service";
import { retrieveKnowledge } from "@/modules/knowledge/retrieval";
import { reindexKnowledgeChunks } from "@/modules/knowledge/reindex";
import { buildSearchText } from "@/modules/knowledge/indexing";
import { chunkDocumentText } from "@/modules/knowledge/ingestion/chunking";
import {
  clearEmbeddingProvider,
  registerEmbeddingProvider,
  type EmbeddingProvider,
} from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";

/**
 * Fase 8, paso 1 — retrieval quality against real PostgreSQL + pgvector:
 * natural-language FTS, "art. 34.8", isolation by `embedding_model`, full
 * fragments, re-indexing. Every document gets a per-run jurisdiction and the
 * searches filter by it: `kindly_test` is never truncated, and GLOBAL rows
 * from earlier runs would otherwise leak into these assertions.
 */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;

const fake = createFakeEmbeddingProvider();
/** Same vectors, different identity: what switching embedding model looks like to the index. */
const otherModel: EmbeddingProvider = { id: "fake-other-model", dimensions: fake.dimensions, embed: (t) => fake.embed(t) };

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations") });
});

beforeEach(() => {
  registerEmbeddingProvider(fake);
});

afterAll(async () => {
  clearEmbeddingProvider();
  await client.end();
});

function jurisdiction() {
  return `J-${randomUUID()}`;
}

async function ingest(title: string, text: string, j: string) {
  const doc = await createDocument({ organizationId: null, visibility: "GLOBAL", title, jurisdiction: j });
  const version = await createDocumentVersion({
    documentId: doc.id,
    version: "1.0",
    status: "CURRENT",
    effectiveFrom: "2024-01-01",
    chunks: chunkDocumentText(text),
  });
  return { doc, version };
}

const PARAGRAPH = "Texto de relleno sobre la organización del tiempo de trabajo en la empresa y su registro diario. ".repeat(6);

/** Artículo 34 long enough to be split by paragraph, with apartado 8 in a later part. */
const ESTATUTO = [
  "TÍTULO I",
  "CAPÍTULO II",
  "Sección 5.ª",
  "Artículo 34. Jornada.",
  `1. La duración de la jornada de trabajo será la pactada en los convenios colectivos. ${PARAGRAPH}`,
  "",
  `2. Mediante convenio colectivo se podrá establecer la distribución irregular de la jornada. ${PARAGRAPH}`,
  "",
  `3. Entre el final de una jornada y el comienzo de la siguiente mediarán, como mínimo, doce horas. ${PARAGRAPH}`,
  "",
  "8. Las personas trabajadoras tienen derecho a solicitar las adaptaciones de la duración y distribución de la jornada para hacer efectivo su derecho a la conciliación de la vida familiar y laboral.",
  "",
  "Artículo 35. Horas extraordinarias.",
  "1. Tendrán la consideración de horas extraordinarias aquellas horas de trabajo que se realicen sobre la duración máxima de la jornada ordinaria.",
].join("\n");

describe("knowledge search quality (Fase 8, paso 1)", () => {
  it("matches a natural-language question that shares only some terms with the text (FTS no longer ANDs)", async () => {
    const j = jurisdiction();
    const { version } = await ingest(
      "Guía de conciliación",
      "La persona trabajadora puede solicitar la adaptación de su jornada para el cuidado de hijos menores.",
      j,
    );
    const question = "¿Puedo pedir que me adapten la jornada para cuidar a mis hijos pequeños este verano?";

    // The old websearch_to_tsquery (AND of every term) finds nothing here.
    const [old] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(knowledgeChunks)
      .where(sql`${knowledgeChunks.documentVersionId} = ${version.id} and ${knowledgeChunks.contentTsv} @@ websearch_to_tsquery('spanish', ${question})`);
    expect(old.n).toBe(0);

    // FTS alone: the query is embedded by another model, so the vector side cannot see this chunk.
    registerEmbeddingProvider(otherModel);
    const results = await retrieveKnowledge({ organizationId: randomUUID(), query: question, jurisdiction: j });
    expect(results.map((r) => r.documentVersionId)).toContain(version.id);
  });

  it("retrieves the part of Artículo 34 that holds apartado 8 for 'art. 34.8' and its variants", async () => {
    const j = jurisdiction();
    await ingest("Estatuto de los Trabajadores", ESTATUTO, j);
    registerEmbeddingProvider(otherModel); // FTS only — the hierarchy must be in the indexed text itself.

    for (const query of ["art. 34.8", "¿Qué dice el artículo 34.8?", "artículo 34 apartado 8", "apartado 8 del artículo 34"]) {
      const [top] = await retrieveKnowledge({ organizationId: randomUUID(), query, jurisdiction: j });
      expect(top, query).toBeDefined();
      expect(top.content, query).toContain("8. Las personas trabajadoras tienen derecho a solicitar las adaptaciones");
      expect(top.path, query).toContain("Artículo 34");
    }
  });

  it("indexes and embeds the hierarchical context, not just the content", async () => {
    const j = jurisdiction();
    const { version } = await ingest("Estatuto de los Trabajadores", ESTATUTO, j);
    const rows = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentVersionId, version.id));
    const apartado8 = rows.find((r) => r.content.includes("8. Las personas trabajadoras"))!;
    expect(apartado8.searchText).toContain("Documento: Estatuto de los Trabajadores");
    expect(apartado8.searchText).toContain("Artículo 34");
    expect(apartado8.searchText).toContain("art. 34.8");
    expect(apartado8.embeddingModel).toBe("fake");

    const lexemes = async (id: string) =>
      (await db.execute<{ l: string[] }>(sql`select tsvector_to_array(content_tsv) as l from knowledge_chunks where id = ${id}`))[0].l;
    expect(await lexemes(apartado8.id)).toContain("34.8");
    const article35 = rows.find((r) => r.content.includes("horas extraordinarias"))!;
    expect(await lexemes(article35.id)).not.toContain("34.8");
    expect(await lexemes(article35.id)).toContain("35.1");
    const [expected] = await fake.embed([apartado8.searchText]);
    expect(apartado8.embedding.slice(0, 5)).toEqual(expected.slice(0, 5).map((v) => expect.closeTo(v, 5)));
  });

  it("never compares vectors from a different embedding model", async () => {
    const j = jurisdiction();
    const token = `semantica${randomUUID().slice(0, 8)}`;
    const a = await ingest("Documento del modelo activo", `${token} contenido del modelo activo`, j);
    registerEmbeddingProvider(otherModel);
    const b = await ingest("Documento de otro modelo", `${token} contenido de otro modelo`, j);

    registerEmbeddingProvider(fake);
    // A query with no lexeme in common: only the vector side can return anything.
    const results = await retrieveKnowledge({ organizationId: randomUUID(), query: "zzqx", jurisdiction: j });
    const versions = results.map((r) => r.documentVersionId);
    expect(versions).toContain(a.version.id);
    expect(versions).not.toContain(b.version.id);
  });

  it("returns the complete fragment (up to the chunker's 1800 chars), never cut", async () => {
    const j = jurisdiction();
    const body = `Artículo 7. Permisos.\n${"Permiso retribuido por fallecimiento de familiar hasta segundo grado. ".repeat(25)}`.slice(0, 1790);
    const { version } = await ingest("Convenio", body, j);
    const [stored] = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentVersionId, version.id));
    expect(stored.content.length).toBeGreaterThan(1000);

    const [top] = await retrieveKnowledge({ organizationId: randomUUID(), query: "permiso por fallecimiento", jurisdiction: j });
    expect(top.chunkId).toBe(stored.id);
    expect(top.content).toBe(stored.content);
  });

  it("reindex rebuilds search_text, re-embeds legacy/other-model chunks, and is idempotent", async () => {
    const j = jurisdiction();
    const { doc, version } = await ingest("Estatuto de los Trabajadores", ESTATUTO, j);
    // Simulate a chunk as migration 0012 left it: provisional text, 'legacy' model, meaningless vector.
    await db
      .update(knowledgeChunks)
      .set({ searchText: sql`${knowledgeChunks.content}`, embeddingModel: "legacy", embedding: new Array(fake.dimensions).fill(0.01) })
      .where(eq(knowledgeChunks.documentVersionId, version.id));

    const first = await reindexKnowledgeChunks({ documentId: doc.id });
    const rows = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentVersionId, version.id));
    expect(first.scanned).toBe(rows.length);
    expect(first.reembedded).toBe(rows.length);
    expect(first.textUpdated).toBe(rows.length);
    for (const row of rows) {
      expect(row.embeddingModel).toBe("fake");
      expect(row.searchText).toBe(buildSearchText({ documentTitle: doc.title, path: row.path, label: row.label, content: row.content }));
    }

    const second = await reindexKnowledgeChunks({ documentId: doc.id });
    expect(second).toEqual({ scanned: rows.length, textUpdated: 0, reembedded: 0 });

    // Switching model: everything is re-embedded, text unchanged.
    registerEmbeddingProvider(otherModel);
    const third = await reindexKnowledgeChunks({ documentId: doc.id });
    expect(third).toEqual({ scanned: rows.length, textUpdated: 0, reembedded: rows.length });

    const forced = await reindexKnowledgeChunks({ documentId: doc.id, force: true });
    expect(forced.reembedded).toBe(rows.length);
  });
});
