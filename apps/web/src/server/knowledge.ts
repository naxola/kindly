import { embeddingProviderFromEnv, knowledgeExtractor } from '@saas/adapters/knowledge'
import type { EmbeddingProvider, KnowledgeExtractor } from '@saas/core'

let provider: EmbeddingProvider | null | undefined

/** The embedding provider of this process (search embeds the query), or null when none is configured. */
export const embeddings = (): EmbeddingProvider | null =>
  provider === undefined ? (provider = embeddingProviderFromEnv()) : provider

/** Tests only. */
export const setEmbeddingsForTests = (next: EmbeddingProvider | null | undefined) => {
  provider = next
}

let extractor: KnowledgeExtractor | undefined

/** What this process uses to read websites (Kindly: discovery of a site's pages). */
export const knowledgeSources = (): KnowledgeExtractor => (extractor ??= knowledgeExtractor)

/** Tests only: replaces it, e.g. with a fake site (CI never touches the network). */
export const setKnowledgeSourcesForTests = (next: KnowledgeExtractor | undefined) => {
  extractor = next
}
