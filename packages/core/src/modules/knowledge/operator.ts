import type { Db } from '@saas/database'
import { chunkDocumentText } from './chunking.ts'
import { EMBEDDING_DIMENSIONS } from './domain.ts'
import type { EmbeddingProvider } from './embedding.ts'
import type { KnowledgeExtractor } from './extractor.ts'
import { MAX_CHUNKS, MAX_EXTRACTED_CHARS, validatePdf, validateWebUrl } from './ingestion-rules.ts'
import { DocumentInput, VersionFields } from './schemas.ts'
import { addVersion } from './service.ts'
import type { z } from 'zod'

/**
 * GLOBAL knowledge (laws, official guides: it reaches every organization) is written only by the
 * operator, with the platform role (`app_platform`, BYPASSRLS), from `pnpm knowledge:ingest`. No
 * actor and no tenant: `db` must be a connection of that role. Synchronous: it is a command, not a
 * request. A failure leaves nothing behind (one transaction).
 */
export type OperatorSource =
  { kind: 'PDF'; data: Uint8Array } | { kind: 'TEXT'; text: string } | { kind: 'WEB'; url: string }

export async function ingestGlobalDocument(
  deps: { db: Db; embeddings: EmbeddingProvider; extractor: KnowledgeExtractor },
  input: {
    /** Add a version to this existing GLOBAL document instead of creating one. */
    documentId?: string
    document: z.input<typeof DocumentInput>
    version: z.input<typeof VersionFields>
    source: OperatorSource
  },
): Promise<{ documentId: string; versionId: string; chunks: number }> {
  const doc = DocumentInput.parse(input.document)
  const v = VersionFields.parse(input.version)
  if (deps.embeddings.dimensions !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `EmbeddingProvider ${deps.embeddings.id} does not produce ${EMBEDDING_DIMENSIONS} dimensions`,
    )
  }
  const { source } = input
  let text: string
  if (source.kind === 'PDF') {
    const ok = validatePdf(source.data)
    if (!ok.ok) throw new Error(ok.code)
    text = await deps.extractor.extractPdf(source.data)
  } else if (source.kind === 'WEB') {
    const ok = validateWebUrl(source.url)
    if (!ok.ok) throw new Error(ok.code)
    text = await deps.extractor.fetchWebText(ok.value)
  } else {
    text = source.text
  }
  text = text.trim()
  if (!text) throw new Error('EMPTY_DOCUMENT')
  if (text.length > MAX_EXTRACTED_CHARS) throw new Error('TOO_LONG')
  const chunks = chunkDocumentText(text)
  if (chunks.length > MAX_CHUNKS) throw new Error('TOO_LONG')
  const vectors = await deps.embeddings.embed(chunks.map((c) => c.content))

  return deps.db.$transaction(async (tx) => {
    const existing = input.documentId
      ? await tx.knowledgeDocument.findFirst({
          where: { id: input.documentId, visibility: 'GLOBAL' },
        })
      : null
    if (input.documentId && !existing) throw new Error('That GLOBAL document does not exist')
    const created =
      existing ??
      (await tx.knowledgeDocument.create({
        data: {
          organizationId: null,
          visibility: 'GLOBAL',
          title: doc.title,
          sourceType: source.kind === 'TEXT' ? 'MANUAL' : source.kind,
          sourceUrl: source.kind === 'WEB' ? source.url : null,
          jurisdiction: doc.jurisdiction ?? null,
          territory: doc.territory ?? null,
          scope: doc.scope ?? null,
        },
      }))
    const version = await addVersion(tx, created, { ...v, chunks }, vectors, v.status)
    return { documentId: created.id, versionId: version.id, chunks: chunks.length }
  })
}
