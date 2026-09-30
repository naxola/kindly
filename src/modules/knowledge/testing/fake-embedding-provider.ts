/**
 * Deterministic fake `EmbeddingProvider` for the test suite (Fase 7a). No
 * network, no API key, fully reproducible — same contract as the fake
 * `MessagingAdapter`: the real OpenAI provider is a later package
 * (`CLAUDE.md` §3). Nothing outside the suite registers it.
 *
 * It is a hashed bag-of-words projected onto `EMBEDDING_DIMENSIONS` and
 * L2-normalized, so that:
 *  - identical text → identical vector (cosine 1.0) — lets a round-trip test
 *    query with a chunk's own content and expect that chunk back;
 *  - texts sharing words are closer than texts that share none — a more
 *    faithful stand-in for a real embedding than pure random noise, still
 *    deterministic.
 * It carries no real semantic meaning and must never be used in production.
 */
import { EMBEDDING_DIMENSIONS } from "@/modules/knowledge/schema";
import type { EmbeddingProvider } from "@/modules/knowledge/embedding-provider";

/** FNV-1a 32-bit — small, fast, deterministic, no dependencies. */
function hash(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function embedOne(text: string, dimensions: number): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  for (const token of tokenize(text)) {
    vec[hash(token) % dimensions] += 1;
  }

  let norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) {
    // Empty / punctuation-only text: a fixed non-zero unit vector so cosine
    // stays defined rather than NaN.
    vec[0] = 1;
    norm = 1;
  }
  return vec.map((v) => v / norm);
}

export function createFakeEmbeddingProvider(
  dimensions: number = EMBEDDING_DIMENSIONS,
): EmbeddingProvider {
  return {
    id: "fake",
    dimensions,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((t) => embedOne(t, dimensions));
    },
  };
}
