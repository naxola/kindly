// Knowledge (Kindly): documents with versions and validity, chunked and embedded for retrieval.
export { EMBEDDING_DIMENSIONS, APPLICABLE_STATUSES, selectApplicableVersion } from './domain.ts'
export type { VersionForSelection } from './domain.ts'
export type { EmbeddingProvider } from './embedding.ts'
export type { KnowledgeExtractor } from './extractor.ts'
export { chunkDocumentText } from './chunking.ts'
export {
  MAX_PDF_BYTES,
  MAX_TEXT_BYTES,
  MAX_EXTRACTED_CHARS,
  MAX_CHUNKS,
  validatePdf,
  validateTextFile,
  validateWebUrl,
} from './ingestion-rules.ts'
export type { SourceCode } from './ingestion-rules.ts'
export {
  ingestVersionJob,
  ingestVersionHandler,
  ingestVersion,
  submitDocument,
  submitVersion,
} from './ingestion.ts'
export type { SubmittedSource, IngestDeps, IngestionErrorCode } from './ingestion.ts'
export { combineRankedResults, DEFAULT_RRF_K } from './retrieval-fusion.ts'
export { searchKnowledge, SearchInput } from './retrieval.ts'
export type { KnowledgeSearchResult } from './retrieval.ts'
export { ingestGlobalDocument } from './operator.ts'
export type { OperatorSource } from './operator.ts'
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
export type { DocumentView, VersionView, ChunkView } from './service.ts'
