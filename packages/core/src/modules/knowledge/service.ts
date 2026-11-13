import {
  withTenant,
  type DocumentVersionStatus,
  type KnowledgeDocument,
  type KnowledgeDocumentVersion,
  type TenantTx,
} from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'
import { insertChunks } from './chunks.ts'
import { EMBEDDING_DIMENSIONS } from './domain.ts'
import type { EmbeddingProvider } from './embedding.ts'
import { DocumentInput, VersionInput } from './schemas.ts'

/**
 * The knowledge base. GLOBAL knowledge (public: laws, official guides) is read by every
 * organization and written only by the operator script with the platform role (D8); what a tenant
 * creates here is always ORGANIZATION knowledge. The organization filter is explicit as well as RLS.
 */

export interface DocumentView extends KnowledgeDocument {
  versions: KnowledgeDocumentVersion[]
}

const own = (ctx: Ctx) => ({
  OR: [{ organizationId: null }, { organizationId: ctx.actor.organizationId }],
})

/** Documents the organization may read (its own plus GLOBAL), newest first, with their versions. */
export async function listDocuments(ctx: Ctx): Promise<DocumentView[]> {
  authorize(ctx.actor, 'knowledge.read')
  return withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.knowledgeDocument.findMany({
      where: own(ctx),
      include: { versions: { orderBy: [{ effectiveFrom: 'desc' }, { version: 'asc' }] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
  )
}

/** A document with its versions (newest validity first). 404 when neither GLOBAL nor the organization's. */
export async function getDocument(ctx: Ctx, documentId: string): Promise<DocumentView> {
  authorize(ctx.actor, 'knowledge.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const doc = await tx.knowledgeDocument.findFirst({
      where: { id: documentId, ...own(ctx) },
      include: { versions: { orderBy: [{ effectiveFrom: 'desc' }, { version: 'asc' }] } },
    })
    if (!doc) throw new DomainError('NOT_FOUND', 'Document not found')
    return doc
  })
}

export interface ChunkView {
  id: string
  ordinal: number
  level: string
  label: string | null
  path: string | null
  content: string
}

/** Chunks of one version in reading order; empty-handed 404 when the version is not readable. */
export async function listChunks(ctx: Ctx, versionId: string): Promise<ChunkView[]> {
  authorize(ctx.actor, 'knowledge.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const version = await tx.knowledgeDocumentVersion.findFirst({
      where: { id: versionId, ...own(ctx) },
      select: { id: true },
    })
    if (!version) throw new DomainError('NOT_FOUND', 'Version not found')
    return tx.knowledgeChunk.findMany({
      where: { documentVersionId: versionId, ...own(ctx) },
      orderBy: { ordinal: 'asc' },
      select: { id: true, ordinal: true, level: true, label: true, path: true, content: true },
    })
  })
}

/** Creates a document of the organization (never GLOBAL: that is the operator's). */
export async function createDocument(ctx: Ctx, input: DocumentInput): Promise<KnowledgeDocument> {
  authorize(ctx.actor, 'knowledge.write')
  const data = DocumentInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const doc = await tx.knowledgeDocument.create({
      data: {
        organizationId: ctx.actor.organizationId,
        visibility: 'ORGANIZATION',
        title: data.title,
        sourceType: data.sourceType,
        sourceUrl: data.sourceUrl ?? null,
        jurisdiction: data.jurisdiction ?? null,
        territory: data.territory ?? null,
        scope: data.scope ?? null,
      },
    })
    await audit(ctx, tx, 'knowledge.document_created', doc.id, {})
    return doc
  })
}

/**
 * Adds a version with its chunks to a document of the organization. The chunks are embedded by the
 * given provider **before** the transaction (a network call must not hold it open). A new CURRENT
 * version supersedes the previous one. Chunks inherit organization and visibility from the document.
 */
export async function createDocumentVersion(
  ctx: Ctx,
  embeddings: EmbeddingProvider,
  documentId: string,
  input: VersionInput,
): Promise<KnowledgeDocumentVersion> {
  authorize(ctx.actor, 'knowledge.write')
  const data = VersionInput.parse(input)
  if (embeddings.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `EmbeddingProvider ${embeddings.id} does not produce ${EMBEDDING_DIMENSIONS} dimensions`,
    )
  }
  const vectors = data.chunks.length
    ? await embeddings.embed(data.chunks.map((c) => c.content))
    : []

  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    // Only the organization's own documents take versions here (GLOBAL ones are not writable).
    const doc = await tx.knowledgeDocument.findFirst({
      where: { id: documentId, organizationId: ctx.actor.organizationId },
    })
    if (!doc) throw new DomainError('NOT_FOUND', 'Document not found')
    const version = await addVersion(tx, doc, data, vectors)
    await audit(ctx, tx, 'knowledge.version_created', version.id, {
      documentId,
      chunks: data.chunks.length,
      embeddingProvider: embeddings.id,
    })
    return version
  })
}

/** Shared by the tenant use case and the operator script: the version, its supersession and its chunks. */
export async function addVersion(
  tx: TenantTx,
  doc: Pick<KnowledgeDocument, 'id' | 'organizationId' | 'visibility'>,
  data: ReturnType<typeof VersionInput.parse>,
  vectors: readonly (readonly number[])[],
  status: DocumentVersionStatus = data.status,
): Promise<KnowledgeDocumentVersion> {
  if (status === 'CURRENT') {
    await tx.knowledgeDocumentVersion.updateMany({
      where: { documentId: doc.id, status: 'CURRENT' },
      data: { status: 'SUPERSEDED' },
    })
  }
  const version = await tx.knowledgeDocumentVersion.create({
    data: {
      organizationId: doc.organizationId,
      documentId: doc.id,
      version: data.version,
      status,
      effectiveFrom: new Date(data.effectiveFrom),
      effectiveUntil: data.effectiveUntil ? new Date(data.effectiveUntil) : null,
      source: data.source ?? null,
    },
  })
  await insertChunks(
    tx,
    {
      organizationId: doc.organizationId,
      visibility: doc.visibility,
      documentId: doc.id,
      versionId: version.id,
    },
    data.chunks,
    vectors,
  )
  return version
}

// Ids only: titles and contents can carry personal data.
const audit = (
  ctx: Ctx,
  tx: TenantTx,
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
