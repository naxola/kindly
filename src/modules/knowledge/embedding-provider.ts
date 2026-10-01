/**
 * `EmbeddingProvider` — the only way the domain turns text into vectors
 * (`docs/ARCHITECTURE.md` §10, `CLAUDE.md` §2: el dominio no se acopla a un
 * proveedor concreto de LLM/embeddings). No real implementation lives here:
 * OpenAI (or any other) is registered from the outside, exactly as the
 * `MessagingAdapter` registry works (`messaging/registry.ts`).
 *
 * Unlike messaging there is no per-channel dimension: a Kindly instance has
 * a single active embedding provider at a time (the one whose dimension the
 * `knowledge_chunks.embedding` column was sized for — `EMBEDDING_DIMENSIONS`
 * in `schema.ts`). The registry therefore holds one provider, not a map.
 *
 * Fase 7a ships only a deterministic fake (`testing/fake-embedding-provider`)
 * registered by the test suite; nothing outside the suite registers a
 * provider yet, so `getEmbeddingProvider()` throws in production until the
 * real one is wired in a later package (`CLAUDE.md` §3 — no construir
 * alrededor de una API externa sin confirmarla).
 */
import "server-only";

export interface EmbeddingProvider {
  /** Stable identifier for logs/audit (e.g. "openai:text-embedding-3-small", "fake"). */
  readonly id: string;
  /** Vector length every `embed` result must have — must match `EMBEDDING_DIMENSIONS`. */
  readonly dimensions: number;
  /**
   * Embed a batch of texts, one vector per input, in the same order. Batched
   * so callers (the ingestion pipeline of 7b) can amortize a real provider's
   * per-request cost.
   */
  embed(texts: string[]): Promise<number[][]>;
}

declare global {
  var __kindlyEmbeddingProvider: EmbeddingProvider | undefined;
}

/**
 * Register the active embedding provider. Backed by `globalThis` for the
 * same reason as `messaging/registry.ts` and `db/client.ts`: under
 * Turbopack's production output each chunk gets its own instantiation of a
 * module, so a plain module-scope variable is invisible across chunks.
 */
export function registerEmbeddingProvider(provider: EmbeddingProvider): void {
  globalThis.__kindlyEmbeddingProvider = provider;
}

/** Thrown when no provider is registered — an expected configuration state, not a failure. */
export class EmbeddingProviderNotConfiguredError extends Error {
  constructor() {
    super("No EmbeddingProvider is registered (OPENAI_API_KEY not set).");
    this.name = "EmbeddingProviderNotConfiguredError";
  }
}

/** The active provider, or throw `EmbeddingProviderNotConfiguredError` when none is registered. */
export function getEmbeddingProvider(): EmbeddingProvider {
  const provider = globalThis.__kindlyEmbeddingProvider;
  if (!provider) {
    throw new EmbeddingProviderNotConfiguredError();
  }
  return provider;
}

export function hasEmbeddingProvider(): boolean {
  return globalThis.__kindlyEmbeddingProvider !== undefined;
}

export function clearEmbeddingProvider(): void {
  globalThis.__kindlyEmbeddingProvider = undefined;
}
