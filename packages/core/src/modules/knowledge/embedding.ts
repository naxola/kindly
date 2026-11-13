/**
 * `EmbeddingProvider`: the only way the domain turns text into vectors (CLAUDE.md: the domain does
 * not couple to a provider). Implementations live outside core (`packages/adapters`); a use case
 * receives the one it should use, like the messaging registry: there is no global.
 */
export interface EmbeddingProvider {
  /** Stable id for logs and audit ("openai:text-embedding-3-small", "fake"). */
  readonly id: string
  /** Length of every vector it returns: must equal `EMBEDDING_DIMENSIONS`. */
  readonly dimensions: number
  /** One vector per input, same order. Batched so a real provider's per-request cost is shared. */
  embed(texts: string[]): Promise<number[][]>
}
