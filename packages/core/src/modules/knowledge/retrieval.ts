import {
  Prisma,
  withTenant,
  type DocumentVersionStatus,
  type KnowledgeChunkLevel,
} from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { authorize } from '../identity/index.ts'
import { toVectorLiteral } from './chunks.ts'
import { APPLICABLE_STATUSES, EMBEDDING_DIMENSIONS } from './domain.ts'
import type { EmbeddingProvider } from './embedding.ts'
import { combineRankedResults } from './retrieval-fusion.ts'

/**
 * Hybrid retrieval: full text (Spanish) plus vector similarity fused with RRF, with **every hard
 * filter applied before ranking** (docs/DATABASE.md §15): tenancy (GLOBAL plus the own organization),
 * legal status and validity at the date asked, and jurisdiction / territory / scope when given. Each
 * result carries what a citation needs (principle 3): document, version, validity, source note and
 * location. The `EvidenceLevel` is not computed here: it belongs to the Copilot, which decides how
 * well the retrieved text supports an answer.
 *
 * Cosine distance is exact (no vector index: see docs/DECISIONS.md, M8a): the candidates are the
 * rows that already passed the filters.
 */

export const SearchInput = z.object({
  query: z.string().trim().min(1).max(500),
  /** 'YYYY-MM-DD'. Default today: the version applicable now, unless a past date is asked about. */
  atDate: z.iso.date().optional(),
  jurisdiction: z.string().trim().min(1).max(120).optional(),
  territory: z.string().trim().min(1).max(120).optional(),
  scope: z.string().trim().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(25).default(8),
  /**
   * Cosine similarity floor of the vector side: without one it would always bring its nearest rows,
   * related or not, and an unrelated text would read as a result. 0.2 is a provisional value, not
   * validated against real embeddings yet: tune it with OpenAI vectors and real documents.
   */
  minSimilarity: z.number().min(0).max(1).default(0.2),
})
export type SearchInput = z.input<typeof SearchInput>

export interface KnowledgeSearchResult {
  chunkId: string
  documentId: string
  documentVersionId: string
  documentTitle: string
  documentSourceUrl: string | null
  /** GLOBAL (public) or ORGANIZATION (the organization's own). */
  visibility: 'GLOBAL' | 'ORGANIZATION'
  version: string
  status: DocumentVersionStatus
  effectiveFrom: string
  effectiveUntil: string | null
  jurisdiction: string | null
  territory: string | null
  scope: string | null
  /** The version's provenance note (e.g. "BOE núm. 5, de 2024-01-10"). */
  sourceNote: string | null
  level: KnowledgeChunkLevel
  label: string | null
  path: string | null
  content: string
  score: number
}

type Row = Omit<KnowledgeSearchResult, 'score' | 'effectiveFrom' | 'effectiveUntil'> & {
  effectiveFrom: Date
  effectiveUntil: Date | null
}

/** Escapes LIKE wildcards: the filters are a case-insensitive equality, never a pattern. */
const literal = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

const day = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Searches the knowledge the organization may read. Needs an embedding provider: without one it says
 * so (503 EMBEDDINGS_NOT_CONFIGURED) instead of silently answering from full text alone, which would
 * pass for a complete answer.
 */
export async function searchKnowledge(
  ctx: Ctx,
  embeddings: EmbeddingProvider | null,
  input: SearchInput,
): Promise<KnowledgeSearchResult[]> {
  authorize(ctx.actor, 'knowledge.read')
  const q = SearchInput.parse(input)
  if (!embeddings) {
    throw new DomainError('SERVICE_UNAVAILABLE', 'The embedding provider is not configured', [
      { code: 'EMBEDDINGS_NOT_CONFIGURED' },
    ])
  }
  if (embeddings.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `EmbeddingProvider ${embeddings.id} does not produce ${EMBEDDING_DIMENSIONS} dimensions`,
    )
  }
  const atDate = q.atDate ?? (ctx.now?.() ?? new Date()).toISOString().slice(0, 10)
  const [vector] = await embeddings.embed([q.query])
  if (!vector) throw new Error('EmbeddingProvider returned no vector')

  const candidates = Math.max(q.limit * 4, 20)
  const applicable = Prisma.join(
    [...APPLICABLE_STATUSES].map((s) => Prisma.sql`${s}::"DocumentVersionStatus"`),
  )
  const orgId = ctx.actor.organizationId
  const filters = Prisma.sql`
    (c.organization_id IS NULL OR c.organization_id = ${orgId}::uuid)
    AND v.status IN (${applicable})
    AND v.ingestion_status = 'READY'
    AND v.effective_from <= ${atDate}::date
    AND (v.effective_until IS NULL OR v.effective_until >= ${atDate}::date)
    ${q.jurisdiction ? Prisma.sql`AND d.jurisdiction ILIKE ${literal(q.jurisdiction)}` : Prisma.empty}
    ${q.territory ? Prisma.sql`AND d.territory ILIKE ${literal(q.territory)}` : Prisma.empty}
    ${q.scope ? Prisma.sql`AND d.scope ILIKE ${literal(q.scope)}` : Prisma.empty}`
  const columns = Prisma.sql`
    c.id AS "chunkId", c.document_id AS "documentId", c.document_version_id AS "documentVersionId",
    d.title AS "documentTitle", d.source_url AS "documentSourceUrl", d.visibility::text AS "visibility",
    v.version AS "version", v.status::text AS "status", v.effective_from AS "effectiveFrom",
    v.effective_until AS "effectiveUntil", d.jurisdiction AS "jurisdiction", d.territory AS "territory",
    d.scope AS "scope", v.source AS "sourceNote", c.level::text AS "level", c.label AS "label",
    c.path AS "path", c.content AS "content"`
  const from = Prisma.sql`FROM knowledge_chunks c
    JOIN knowledge_document_versions v ON v.id = c.document_version_id
    JOIN knowledge_documents d ON d.id = c.document_id`
  const tsQuery = Prisma.sql`websearch_to_tsquery('spanish', ${q.query})`

  const [fts, semantic] = await withTenant(ctx.db, orgId, async (tx) => [
    await tx.$queryRaw<Row[]>`SELECT ${columns} ${from}
      WHERE ${filters} AND c.content_tsv @@ ${tsQuery}
      ORDER BY ts_rank(c.content_tsv, ${tsQuery}) DESC, c.id LIMIT ${candidates}`,
    await tx.$queryRaw<Row[]>`SELECT ${columns} ${from}
      WHERE ${filters} AND (c.embedding <=> ${toVectorLiteral(vector)}::vector) <= ${1 - q.minSimilarity}
      ORDER BY c.embedding <=> ${toVectorLiteral(vector)}::vector, c.id LIMIT ${candidates}`,
  ])

  return combineRankedResults([fts, semantic], (r) => r.chunkId)
    .slice(0, q.limit)
    .map((r) => ({
      ...r,
      effectiveFrom: day(r.effectiveFrom),
      effectiveUntil: r.effectiveUntil ? day(r.effectiveUntil) : null,
    }))
}
