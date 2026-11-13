import {
  Prisma,
  type KnowledgeChunkLevel,
  type KnowledgeVisibility,
  type TenantTx,
} from '@saas/database'
import { newId } from '@saas/database'
import { EMBEDDING_DIMENSIONS } from './domain.ts'

export interface ChunkInput {
  ordinal: number
  level?: KnowledgeChunkLevel | undefined
  label?: string | null | undefined
  path?: string | null | undefined
  content: string
}

/** pgvector's text form of a vector. */
export const toVectorLiteral = (v: readonly number[]) => `[${v.join(',')}]`

/**
 * Inserts the chunks of a version with their embeddings. `organizationId` and `visibility` come from
 * the parent document, never from the caller: the retrieval filters read them on the chunk itself.
 * Raw SQL because Prisma cannot write a `vector` column.
 */
export async function insertChunks(
  tx: TenantTx,
  parent: {
    organizationId: string | null
    visibility: KnowledgeVisibility
    documentId: string
    versionId: string
  },
  chunks: readonly ChunkInput[],
  embeddings: readonly (readonly number[])[],
): Promise<void> {
  if (embeddings.length !== chunks.length) {
    throw new Error('EmbeddingProvider returned a different number of vectors than inputs')
  }
  for (const e of embeddings) {
    if (e.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Embedding has ${e.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`)
    }
  }
  // Batches keep each statement far below the driver's parameter limit.
  const BATCH = 100
  for (let i = 0; i < chunks.length; i += BATCH) {
    const rows = chunks.slice(i, i + BATCH).map((c, j) => {
      const v = embeddings[i + j]!
      return Prisma.sql`(${newId()}::uuid, ${parent.organizationId}::uuid,
        ${parent.visibility}::"KnowledgeVisibility", ${parent.documentId}::uuid, ${parent.versionId}::uuid,
        ${c.ordinal}, ${c.level ?? 'FRAGMENT'}::"KnowledgeChunkLevel", ${c.label ?? null}, ${c.path ?? null},
        ${c.content}, ${toVectorLiteral(v)}::vector)`
    })
    await tx.$executeRaw`INSERT INTO knowledge_chunks
      (id, organization_id, visibility, document_id, document_version_id, ordinal, level, label, path, content, embedding)
      VALUES ${Prisma.join(rows)}`
  }
}
