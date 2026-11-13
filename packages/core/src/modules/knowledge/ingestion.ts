import type { Prisma } from '@saas/database'
import { withTenant, type Db, type KnowledgeDocumentVersion } from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { defineJob, type JobContext } from '../../jobs.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'
import { chunkDocumentText } from './chunking.ts'
import { insertChunks } from './chunks.ts'
import { EMBEDDING_DIMENSIONS } from './domain.ts'
import type { EmbeddingProvider } from './embedding.ts'
import type { KnowledgeExtractor } from './extractor.ts'
import {
  MAX_CHUNKS,
  MAX_EXTRACTED_CHARS,
  validatePdf,
  validateTextFile,
  validateWebUrl,
} from './ingestion-rules.ts'
import { DocumentInput, VersionFields } from './schemas.ts'

/**
 * Asynchronous ingestion (D9). A submission stores the version as DRAFT/PENDING with its source and
 * enqueues a job; the worker extracts, chunks, embeds and stores the chunks, then gives the version
 * its requested status (superseding the previous CURRENT only then: a pending upload never takes the
 * place of a version that still has its chunks). The uploaded bytes live only until the job ends,
 * whatever the outcome; only the extracted text, chunked, stays. Always ORGANIZATION knowledge: GLOBAL
 * is the operator's (`operator.ts`).
 */

export const ingestVersionJob = defineJob({
  name: 'knowledge.ingest-version',
  schema: z.object({ versionId: z.uuid() }),
  retryLimit: 3,
  retryDelaySeconds: 30,
  expireInSeconds: 20 * 60,
})

/** What can be submitted. PDF and text arrive as bytes (validated by magic bytes); a page as a URL. */
export type SubmittedSource =
  | { kind: 'PDF'; data: Uint8Array }
  | { kind: 'TEXT'; data: Uint8Array }
  | { kind: 'WEB'; url: string }

/** Why an ingestion ended without chunks: stable codes, never a provider message. */
export type IngestionErrorCode =
  | 'EMBEDDINGS_NOT_CONFIGURED'
  | 'EXTRACTION_FAILED'
  | 'EMPTY_DOCUMENT'
  | 'TOO_LONG'
  | 'EMBEDDING_FAILED'

function checkSource(source: SubmittedSource): {
  kind: SubmittedSource['kind']
  data: Uint8Array | null
  url: string | null
} {
  const bad = (code: string): never => {
    throw new DomainError('VALIDATION_FAILED', 'The source is not valid', [
      { path: 'source', code },
    ])
  }
  if (source.kind === 'WEB') {
    const v = validateWebUrl(source.url)
    return v.ok ? { kind: 'WEB', data: null, url: v.value } : bad(v.code)
  }
  if (source.kind === 'PDF') {
    const v = validatePdf(source.data)
    return v.ok ? { kind: 'PDF', data: v.value, url: null } : bad(v.code)
  }
  const v = validateTextFile(source.data)
  return v.ok ? { kind: 'TEXT', data: source.data, url: null } : bad(v.code)
}

const SOURCE_TYPE = { PDF: 'PDF', WEB: 'WEB', TEXT: 'MANUAL' } as const

type VersionFields = z.input<typeof VersionFields>

/** A new document of the organization with its first version, ingested in the background. */
export async function submitDocument(
  ctx: Ctx,
  document: DocumentInput,
  version: VersionFields,
  source: SubmittedSource,
): Promise<{ documentId: string; versionId: string }> {
  authorize(ctx.actor, 'knowledge.write')
  const doc = DocumentInput.parse(document)
  const v = VersionFields.parse(version)
  const checked = checkSource(source)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const created = await tx.knowledgeDocument.create({
      data: {
        organizationId: ctx.actor.organizationId,
        visibility: 'ORGANIZATION',
        title: doc.title,
        sourceType: SOURCE_TYPE[checked.kind],
        sourceUrl: checked.url,
        jurisdiction: doc.jurisdiction ?? null,
        territory: doc.territory ?? null,
        scope: doc.scope ?? null,
      },
    })
    const pending = await createPending(ctx, tx, created.id, v, checked)
    await audit(ctx, tx, 'knowledge.document_submitted', created.id, { versionId: pending.id })
    return { documentId: created.id, versionId: pending.id }
  })
}

/** A new version of an existing document of the organization, ingested in the background. */
export async function submitVersion(
  ctx: Ctx,
  documentId: string,
  version: VersionFields,
  source: SubmittedSource,
): Promise<{ versionId: string }> {
  authorize(ctx.actor, 'knowledge.write')
  const v = VersionFields.parse(version)
  const checked = checkSource(source)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    // Only the organization's own documents: GLOBAL ones are not editable from here.
    const doc = await tx.knowledgeDocument.findFirst({
      where: { id: documentId, organizationId: ctx.actor.organizationId },
      select: { id: true },
    })
    if (!doc) throw new DomainError('NOT_FOUND', 'Document not found')
    const pending = await createPending(ctx, tx, doc.id, v, checked)
    await audit(ctx, tx, 'knowledge.version_submitted', doc.id, { versionId: pending.id })
    return { versionId: pending.id }
  })
}

async function createPending(
  ctx: Ctx,
  tx: Parameters<Parameters<typeof withTenant>[2]>[0],
  documentId: string,
  v: z.output<typeof VersionFields>,
  source: ReturnType<typeof checkSource>,
) {
  const created = await tx.knowledgeDocumentVersion.create({
    data: {
      organizationId: ctx.actor.organizationId,
      documentId,
      version: v.version,
      status: 'DRAFT',
      requestedStatus: v.status,
      effectiveFrom: new Date(v.effectiveFrom),
      effectiveUntil: v.effectiveUntil ? new Date(v.effectiveUntil) : null,
      source: v.source ?? null,
      ingestionStatus: 'PENDING',
      sourceKind: source.kind,
      sourceUrl: source.url,
      sourceData: source.data ? Buffer.from(source.data) : null,
    },
    omit: { sourceData: true },
  })
  await ctx.queue.enqueue(
    tx,
    ingestVersionJob,
    { versionId: created.id },
    {
      organizationId: ctx.actor.organizationId,
      correlationId: ctx.correlationId,
      idempotencyKey: `knowledge-version:${created.id}`,
    },
  )
  return created
}

export interface IngestDeps {
  db: Db
  /** Null when no provider is configured: the ingestion then fails with a clear code. */
  embeddings: EmbeddingProvider | null
  extractor: KnowledgeExtractor
}

class Permanent extends Error {
  constructor(readonly code: IngestionErrorCode) {
    super(code)
  }
}

/**
 * Processes one pending version. Idempotent: a version already READY is left alone, and a retry
 * replaces whatever chunks an earlier attempt left. A problem that retrying cannot fix (no provider,
 * an empty or oversized document) ends the version as FAILED at once; a transient one rethrows so the
 * queue retries it, and only the last attempt marks it FAILED.
 */
export async function ingestVersion(
  deps: IngestDeps,
  organizationId: string,
  versionId: string,
  attempt: { number: number; limit: number },
): Promise<void> {
  const version = await withTenant(deps.db, organizationId, async (tx) => {
    const v = await tx.knowledgeDocumentVersion.findFirst({ where: { id: versionId } })
    if (!v || v.ingestionStatus === 'READY' || v.ingestionStatus === 'FAILED') return null
    await tx.knowledgeDocumentVersion.update({
      where: { id: versionId },
      data: { ingestionStatus: 'PROCESSING' },
    })
    return v
  })
  if (!version) return

  try {
    const chunks = await prepare(deps, version)
    const vectors = await embed(
      deps,
      chunks.map((c) => c.content),
    )
    await withTenant(deps.db, organizationId, async (tx) => {
      const doc = await tx.knowledgeDocument.findUniqueOrThrow({
        where: { id: version.documentId },
      })
      await tx.$executeRaw`DELETE FROM knowledge_chunks WHERE document_version_id = ${versionId}::uuid`
      await insertChunks(
        tx,
        { organizationId, visibility: doc.visibility, documentId: doc.id, versionId },
        chunks,
        vectors,
      )
      const status = version.requestedStatus ?? 'DRAFT'
      if (status === 'CURRENT') {
        await tx.knowledgeDocumentVersion.updateMany({
          where: { documentId: doc.id, status: 'CURRENT', id: { not: versionId } },
          data: { status: 'SUPERSEDED' },
        })
      }
      await tx.knowledgeDocumentVersion.update({
        where: { id: versionId },
        data: finished({ ingestionStatus: 'READY', status }),
      })
    })
  } catch (error) {
    const permanent = error instanceof Permanent
    if (!permanent && attempt.number < attempt.limit) throw error
    const code: IngestionErrorCode = permanent ? error.code : 'EXTRACTION_FAILED'
    await withTenant(deps.db, organizationId, (tx) =>
      tx.knowledgeDocumentVersion.update({
        where: { id: versionId },
        data: finished({ ingestionStatus: 'FAILED', ingestionError: code }),
      }),
    )
  }
}

/** The end of an ingestion, whatever the outcome: the uploaded source is not kept. */
const finished = (
  data: Prisma.KnowledgeDocumentVersionUpdateInput,
): Prisma.KnowledgeDocumentVersionUpdateInput => ({
  ...data,
  sourceData: null,
  sourceUrl: null,
  sourceKind: null,
})

async function prepare(deps: IngestDeps, v: KnowledgeDocumentVersion) {
  const text = (await extract(deps, v)).trim()
  if (!text) throw new Permanent('EMPTY_DOCUMENT')
  if (text.length > MAX_EXTRACTED_CHARS) throw new Permanent('TOO_LONG')
  const chunks = chunkDocumentText(text)
  if (chunks.length > MAX_CHUNKS) throw new Permanent('TOO_LONG')
  return chunks
}

async function extract(deps: IngestDeps, v: KnowledgeDocumentVersion): Promise<string> {
  if (!deps.embeddings) throw new Permanent('EMBEDDINGS_NOT_CONFIGURED')
  try {
    switch (v.sourceKind) {
      case 'PDF':
        return await deps.extractor.extractPdf(new Uint8Array(v.sourceData!))
      case 'TEXT':
        return Buffer.from(v.sourceData!).toString('utf8')
      case 'WEB':
        return await deps.extractor.fetchWebText(v.sourceUrl!)
      default:
        throw new Permanent('EXTRACTION_FAILED')
    }
  } catch (error) {
    if (error instanceof Permanent) throw error
    // A page that is down or a PDF that is broken may be transient: retried, then FAILED.
    throw new Error('extraction failed', { cause: error })
  }
}

async function embed(deps: IngestDeps, texts: string[]): Promise<number[][]> {
  const provider = deps.embeddings!
  if (provider.dimensions !== EMBEDDING_DIMENSIONS) throw new Permanent('EMBEDDING_FAILED')
  return provider.embed(texts)
}

export const ingestVersionHandler =
  (deps: IngestDeps) =>
  async (payload: z.output<typeof ingestVersionJob.schema>, ctx: JobContext): Promise<void> => {
    if (!ctx.organizationId) throw new Error('knowledge.ingest-version needs an organization')
    await ingestVersion(deps, ctx.organizationId, payload.versionId, {
      number: ctx.attempt,
      limit: ingestVersionJob.retryLimit,
    })
  }

// Ids and counts only.
const audit = (
  ctx: Ctx,
  tx: Parameters<Parameters<typeof withTenant>[2]>[0],
  action: string,
  id: string,
  after: Record<string, unknown>,
) =>
  writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'knowledge',
    resourceId: id,
    after: after as never,
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })
