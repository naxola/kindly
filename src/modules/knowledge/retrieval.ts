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
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, cosineDistance } from "drizzle-orm";
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
  score: number;
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

const resultColumns = {
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

function baseQuery() {
  return db
    .select(resultColumns)
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

  const tsQuery = sql`websearch_to_tsquery('spanish', ${input.query})`;

  const ftsResults = await baseQuery()
    .where(and(filters, sql`${knowledgeChunks.contentTsv} @@ ${tsQuery}`))
    .orderBy(desc(sql`ts_rank(${knowledgeChunks.contentTsv}, ${tsQuery})`))
    .limit(fetchLimit);

  const [queryEmbedding] = await getEmbeddingProvider().embed([input.query]);

  const vectorResults = await baseQuery()
    .where(filters)
    .orderBy(asc(cosineDistance(knowledgeChunks.embedding, queryEmbedding)))
    .limit(fetchLimit);

  return combineRankedResults([ftsResults, vectorResults], (r) => r.chunkId).slice(0, limit);
}
