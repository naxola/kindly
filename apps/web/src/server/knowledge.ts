import { embeddingProviderFromEnv } from '@saas/adapters/knowledge'
import type { EmbeddingProvider } from '@saas/core'

let provider: EmbeddingProvider | null | undefined

/** The embedding provider of this process (search embeds the query), or null when none is configured. */
export const embeddings = (): EmbeddingProvider | null =>
  provider === undefined ? (provider = embeddingProviderFromEnv()) : provider

/** Tests only. */
export const setEmbeddingsForTests = (next: EmbeddingProvider | null | undefined) => {
  provider = next
}
