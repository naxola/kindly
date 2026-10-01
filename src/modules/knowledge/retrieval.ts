/**
 * Hybrid knowledge retrieval (Fase 7c): full-text search + vector
 * similarity, fused with Reciprocal Rank Fusion (`retrieval-fusion.ts`),
 * with every hard filter from `docs/DATABASE.md` §15 applied *before*
 * ranking — tenancy, legal status/vigencia, and (when given) jurisdiction/
 * territory/scope. This is the last purely-backend piece of Knowledge;
 * building `AISuggestion`/`AISource` from these results is Fase 8's job,
 * not this one's.
 *
 * Two plain Drizzle queries (one ordered by `ts_rank`, one by
 * `cosineDistance`) fused in JS, not a hand-written SQL CTE — same idiom
 * this repo already uses for its other non-trivial queries
 * (`conversations/service.ts::listConversationsWithPreview`: query builder
 * + targeted `sql` fragments, never raw `db.execute`). Two round-trips
 * instead of one is an acceptable cost at this scale (`CLAUDE.md` §2 — no
 * infraestructura sin necesidad real) and far simpler to test than a CTE
 * with window functions.
 */
import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, cosineDistance, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  documents,
  documentVersions,
  knowledgeChunks,
  type DocumentVersionStatus,
  type KnowledgeChunkLevel,
} from "@/modules/knowledge/schema";
import { APPLICABLE_STATUSES } from "@/modules/knowledge/domain";
import { knowledgeVisibilityCondition } from "@/modules/knowledge/visibility";
import { getEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { combineRankedResults } from "@/modules/knowledge/retrieval-fusion";
import { normalizeLegalReferences } from "@/modules/knowledge/indexing";

export interface RetrieveKnowledgeInput {
  /** The acting organization — required, like every other read in this module. */
  organizationId: string;
  query: string;
  /** 'YYYY-MM-DD'. Defaults to today — the version applicable *now*, unless asked about a past date. */
  atDate?: string;
  jurisdiction?: string;
  territory?: string;
  scope?: string;
  /** Top-K results after fusion. Default 8. */
  limit?: number;
}

export interface KnowledgeSearchResult {
  chunkId: string;
  documentId: string;
  documentVersionId: string;
  documentTitle: string;
  documentSourceUrl: string | null;
  version: string;
  status: DocumentVersionStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  jurisdiction: string | null;
  territory: string | null;
  scope: string | null;
  /** `document_versions.source` — a citation/provenance note (e.g. "BOE núm. 5, de 2024-01-10"). */
  sourceNote: string | null;
  level: KnowledgeChunkLevel;
  label: string | null;
  path: string | null;
  content: string;
  /** RRF score — ordering only, not comparable across queries. */
  score: number;
  /**
   * Absolute relevance signals, for deciding whether a candidate is worth
   * offering at all (Fase 8): the chunk matches at least one lexeme of the
   * query, and/or its cosine similarity (1 = identical direction) to the
   * query, or null when the chunk was embedded by another model.
   */
  ftsMatch: boolean;
  similarity: number | null;
}

/**
 * Natural-language FTS query: the OR of the query's own lexemes (Spanish
 * stemming, stopwords dropped), so a chunk matches when it shares *some*
 * terms and ranks higher the more it shares (`ts_rank_cd`). Built from
 * `to_tsvector(query)` rather than `websearch_to_tsquery`, which ANDs every
 * term and gives operator meaning to user text ("-horas" would become a
 * negation). Each lexeme is quoted, so no user text is parsed as tsquery
 * syntax. A query of only stopwords yields an empty tsquery (no FTS match).
 */
function naturalLanguageTsQuery(query: string) {
  return sql`(select coalesce(string_agg(quote_literal(lexeme), ' | '), '')::tsquery from unnest(tsvector_to_array(to_tsvector('spanish', ${query}))) as lexeme)`;
}

/** How many candidates each sub-query fetches before fusion narrows to `limit`. */
function candidateLimit(limit: number): number {
  return Math.max(limit * 4, 20);
}

/**
 * Legal-status + vigencia hard filter (`docs/DATABASE.md` §15), reproducing
 * `domain.ts::selectApplicableVersion`'s rule as a row filter: a version
 * applies at `atDate` when its status is one of `APPLICABLE_STATUSES` and
 * `atDate` falls within `[effectiveFrom, effectiveUntil]` (open-ended when
 * `effectiveUntil` is null). Known simplification: unlike
 * `selectApplicableVersion`, this doesn't pick a single "most specific"
 * version per document when two overlap (malformed data) — several
 * documents are being searched at once here, not one document's versions.
 */
function versionApplicabilityCondition(atDate: string) {
  return and(
    inArray(documentVersions.status, [...APPLICABLE_STATUSES]),
    lte(documentVersions.effectiveFrom, atDate),
    or(isNull(documentVersions.effectiveUntil), gte(documentVersions.effectiveUntil, atDate)),
  );
}

function hardFilters(input: Required<Pick<RetrieveKnowledgeInput, "organizationId" | "atDate">> & RetrieveKnowledgeInput) {
  return and(
    knowledgeVisibilityCondition(input.organizationId, {
      visibility: knowledgeChunks.visibility,
      organizationId: knowledgeChunks.organizationId,
    }),
    versionApplicabilityCondition(input.atDate),
    input.jurisdiction ? ilike(documents.jurisdiction, input.jurisdiction) : undefined,
    input.territory ? ilike(documents.territory, input.territory) : undefined,
    input.scope ? ilike(documents.scope, input.scope) : undefined,
  );
}

const baseColumns = {
  chunkId: knowledgeChunks.id,
  documentId: knowledgeChunks.documentId,
  documentVersionId: knowledgeChunks.documentVersionId,
  documentTitle: documents.title,
  documentSourceUrl: documents.sourceUrl,
  version: documentVersions.version,
  status: documentVersions.status,
  effectiveFrom: documentVersions.effectiveFrom,
  effectiveUntil: documentVersions.effectiveUntil,
  jurisdiction: documents.jurisdiction,
  territory: documents.territory,
  scope: documents.scope,
  sourceNote: documentVersions.source,
  level: knowledgeChunks.level,
  label: knowledgeChunks.label,
  path: knowledgeChunks.path,
  content: knowledgeChunks.content,
};

function baseQuery(signals: { ftsMatch: SQL<boolean>; similarity: SQL<number | null> }) {
  return db
    .select({ ...baseColumns, ...signals })
    .from(knowledgeChunks)
    .innerJoin(documentVersions, eq(documentVersions.id, knowledgeChunks.documentVersionId))
    .innerJoin(documents, eq(documents.id, knowledgeChunks.documentId));
}

/**
 * Hybrid search: full-text + vector similarity, hard-filtered by tenancy
 * and vigencia (and jurisdiction/territory/scope when given), fused with
 * RRF. Requires an `EmbeddingProvider` to already be registered
 * (`embedding-provider.ts`) — throws otherwise, same as ingestion; never
 * silently falls back to FTS-only.
 */
export async function retrieveKnowledge(input: RetrieveKnowledgeInput): Promise<KnowledgeSearchResult[]> {
  const limit = input.limit ?? 8;
  const atDate = input.atDate ?? new Date().toISOString().slice(0, 10);
  const filters = hardFilters({ ...input, atDate });
  const fetchLimit = candidateLimit(limit);

  const query = normalizeLegalReferences(input.query);
  const tsQuery = naturalLanguageTsQuery(query);

  const provider = getEmbeddingProvider();
  const [queryEmbedding] = await provider.embed([query]);

  const signals = {
    ftsMatch: sql<boolean>`${knowledgeChunks.contentTsv} @@ ${tsQuery}`,
    // Only vectors from the active model are comparable with the query vector.
    similarity: sql<number | null>`case when ${knowledgeChunks.embeddingModel} = ${provider.id} then ${sql`1 - (${cosineDistance(knowledgeChunks.embedding, queryEmbedding)})`} end`,
  };

  const ftsResults = await baseQuery(signals)
    .where(and(filters, sql`${knowledgeChunks.contentTsv} @@ ${tsQuery}`))
    .orderBy(desc(sql`ts_rank_cd(${knowledgeChunks.contentTsv}, ${tsQuery})`))
    .limit(fetchLimit);

  const vectorResults = await baseQuery(signals)
    .where(and(filters, eq(knowledgeChunks.embeddingModel, provider.id)))
    .orderBy(asc(cosineDistance(knowledgeChunks.embedding, queryEmbedding)))
    .limit(fetchLimit);

  return combineRankedResults([ftsResults, vectorResults], (r) => r.chunkId).slice(0, limit);
}
