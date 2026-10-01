/**
 * Drizzle schema for the Knowledge base. Scope: Fase 7a — capa de datos del
 * backbone RAG (`docs/DATABASE.md` §13-15, `docs/ARCHITECTURE.md` §9,
 * `docs/PRODUCT.md` §11). No ingesta, recuperación ni UI todavía (7b/7c/7e).
 *
 * Tres tablas, con la **separación estricta GLOBAL vs ORGANIZATION** que es
 * un principio de producto (`CLAUDE.md` §2, `PRODUCT.md` §11): conocimiento
 * público (leyes, reglamentos, guías oficiales) visible para todas las
 * organizaciones, frente a conocimiento privado de una `Organization`. Una
 * organización nunca recupera conocimiento privado de otra.
 *
 * - `documents`: la unidad de conocimiento. `organization_id IS NULL` ⟺
 *   `visibility = 'GLOBAL'`, garantizado por un CHECK a nivel de base de
 *   datos (invariante de la separación estricta) además de validarse en
 *   `service.ts` (defensa en profundidad, `CLAUDE.md` §5).
 * - `document_versions`: el versionado de `DATABASE.md` §13. La norma vigente
 *   hoy no es necesariamente la aplicable a una fecha pasada relevante para
 *   un caso, así que la recuperación es *version-aware* (`domain.ts`,
 *   `selectApplicableVersion`) usando `effective_from`/`effective_until`, no
 *   solo "la actual". Índice único parcial: como mucho una versión `CURRENT`
 *   por documento (mismo patrón "cerrar la fila abierta" que `memberships`).
 * - `knowledge_chunks`: división semántica del documento conservando su
 *   jerarquía real (Chapter/Section/Article/Paragraph/Fragment,
 *   `DATABASE.md` §14). Cada chunk guarda su `embedding` (pgvector) y una
 *   columna `tsvector` generada para la futura búsqueda híbrida FTS+vector
 *   (7c). **`organization_id` y `visibility` se denormalizan aquí a
 *   propósito**: los hard filters de tenancy/visibilidad han de aplicarse
 *   sobre la propia fila del chunk *antes* del ranking semántico
 *   (`DATABASE.md` §15), sin un join al documento en la ruta caliente. Son
 *   inmutables tras la creación (un documento no cambia de organización ni
 *   de ámbito) y los escribe siempre junta la misma función de servicio,
 *   derivados del documento padre — nunca a mano por separado. Detalle en
 *   `docs/DECISIONS.md` (entrada Fase 7a).
 *
 * El tipo de la columna `embedding` es `vector(1536)`: la dimensión objetivo
 * del proveedor real inicial (OpenAI `text-embedding-3-small`). Fase 7a se
 * construye contra un `EmbeddingProvider` fake determinista
 * (`embedding-provider.ts`, `CLAUDE.md` §3); cambiar a OpenAI más tarde es
 * registrar otro proveedor, sin migración, mientras la dimensión coincida.
 */
import { relations, sql, type SQL } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
  date,
} from "drizzle-orm/pg-core";
import { organizations } from "@/modules/organizations/schema";

/** Dimensión del vector de embeddings — ver cabecera. Una sola fuente de verdad. */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * `tsvector` no tiene tipo nativo en drizzle 0.45; se declara con
 * `customType` para que drizzle-kit lo rastree (sin drift en futuras
 * migraciones) y la columna generada se mantenga sola en Postgres.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const knowledgeVisibility = pgEnum("knowledge_visibility", ["GLOBAL", "ORGANIZATION"]);
export type KnowledgeVisibility = (typeof knowledgeVisibility.enumValues)[number];

export const knowledgeDocumentSourceType = pgEnum("knowledge_document_source_type", [
  "MANUAL",
  "PDF",
  "WEB",
]);
export type KnowledgeDocumentSourceType = (typeof knowledgeDocumentSourceType.enumValues)[number];

export const documentVersionStatus = pgEnum("document_version_status", [
  "DRAFT",
  "CURRENT",
  "SUPERSEDED",
  "REPEALED",
  "HISTORICAL",
]);
export type DocumentVersionStatus = (typeof documentVersionStatus.enumValues)[number];

export const knowledgeChunkLevel = pgEnum("knowledge_chunk_level", [
  "CHAPTER",
  "SECTION",
  "ARTICLE",
  "PARAGRAPH",
  "FRAGMENT",
]);
export type KnowledgeChunkLevel = (typeof knowledgeChunkLevel.enumValues)[number];

export const documents = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULL ⟺ GLOBAL (público). Una organización ⟺ ORGANIZATION (privado).
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    visibility: knowledgeVisibility("visibility").notNull(),
    title: text("title").notNull(),
    sourceType: knowledgeDocumentSourceType("source_type").notNull().default("MANUAL"),
    sourceUrl: text("source_url"),
    // Metadatos de vigencia/aplicabilidad (`DATABASE.md` §13/§15). Texto
    // libre por ahora: la lista de jurisdicciones/ámbitos crece y no se
    // cierra en un enum inventado (mismo criterio que `Activity.type`).
    jurisdiction: text("jurisdiction"),
    territory: text("territory"),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // El invariante de la separación estricta, a nivel de base de datos:
    // GLOBAL si y solo si no hay organización.
    check(
      "knowledge_documents_global_null_org",
      sql`(${table.visibility} = 'GLOBAL') = (${table.organizationId} is null)`,
    ),
    index("knowledge_documents_org_visibility_idx").on(table.organizationId, table.visibility),
  ],
);

export const documentVersions = pgTable(
  "knowledge_document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    status: documentVersionStatus("status").notNull().default("DRAFT"),
    // `date` en modo string (mismo patrón que `memberships.feePaidUntil`):
    // la vigencia es por día, no por instante. `effectiveUntil` NULL = abierto.
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveUntil: date("effective_until", { mode: "string" }),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_document_versions_document_idx").on(table.documentId),
    // Como mucho una versión CURRENT por documento; una nueva CURRENT
    // supersede la anterior en `service.ts`.
    uniqueIndex("knowledge_document_versions_current_unique")
      .on(table.documentId)
      .where(sql`status = 'CURRENT'`),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Denormalizados desde el documento padre — ver cabecera.
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    visibility: knowledgeVisibility("visibility").notNull(),
    ordinal: integer("ordinal").notNull(),
    level: knowledgeChunkLevel("level").notNull().default("FRAGMENT"),
    label: text("label"),
    path: text("path"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    // Columna generada para la búsqueda de texto completo de 7c. 'spanish':
    // el conocimiento normativo del producto es en español (decisión
    // registrada en `docs/DECISIONS.md`, Fase 7a).
    contentTsv: tsvector("content_tsv")
      .notNull()
      .generatedAlwaysAs((): SQL => sql`to_tsvector('spanish', content)`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Hard filter de tenancy/visibilidad antes del ranking (`DATABASE.md` §15).
    index("knowledge_chunks_org_visibility_idx").on(table.organizationId, table.visibility),
    index("knowledge_chunks_version_ordinal_idx").on(table.documentVersionId, table.ordinal),
    // FTS (7c).
    index("knowledge_chunks_content_tsv_idx").using("gin", table.contentTsv),
    // Búsqueda semántica por distancia coseno (7c).
    index("knowledge_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documents.organizationId],
    references: [organizations.id],
  }),
  versions: many(documentVersions),
  chunks: many(knowledgeChunks),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one, many }) => ({
  document: one(documents, {
    fields: [documentVersions.documentId],
    references: [documents.id],
  }),
  chunks: many(knowledgeChunks),
}));

export const knowledgeChunksRelations = relations(knowledgeChunks, ({ one }) => ({
  documentVersion: one(documentVersions, {
    fields: [knowledgeChunks.documentVersionId],
    references: [documentVersions.id],
  }),
  document: one(documents, {
    fields: [knowledgeChunks.documentId],
    references: [documents.id],
  }),
  organization: one(organizations, {
    fields: [knowledgeChunks.organizationId],
    references: [organizations.id],
  }),
}));
