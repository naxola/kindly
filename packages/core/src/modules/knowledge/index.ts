// Knowledge (Kindly): documents with versions and validity, chunked and embedded for retrieval.
export { EMBEDDING_DIMENSIONS, APPLICABLE_STATUSES, selectApplicableVersion } from './domain.ts'
export type { VersionForSelection } from './domain.ts'
export type { EmbeddingProvider } from './embedding.ts'
export { FakeEmbeddingProvider } from './testing/fake-embedding.ts'
export { DocumentInput, VersionInput } from './schemas.ts'
export { toVectorLiteral } from './chunks.ts'
export type { ChunkInput } from './chunks.ts'
export {
  listDocuments,
  getDocument,
  listChunks,
  createDocument,
  createDocumentVersion,
} from './service.ts'
export type { DocumentView, ChunkView } from './service.ts'
