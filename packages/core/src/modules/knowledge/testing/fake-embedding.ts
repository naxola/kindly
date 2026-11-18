import { EMBEDDING_DIMENSIONS } from '../domain.ts'
import type { EmbeddingProvider } from '../embedding.ts'

/** FNV-1a 32-bit: small, fast, deterministic. */
function hash(token: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

function embedOne(text: string, dimensions: number): number[] {
  const vec = new Array<number>(dimensions).fill(0)
  for (const token of tokenize(text)) vec[hash(token) % dimensions]! += 1
  let norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  if (norm === 0) {
    // Empty or punctuation-only text: a fixed unit vector so cosine stays defined.
    vec[0] = 1
    norm = 1
  }
  return vec.map((v) => v / norm)
}

/**
 * Deterministic fake for tests (no network, no key). A hashed bag of words, L2-normalized: identical
 * text gives an identical vector and texts that share words are closer than texts that share none.
 * It has no real semantics and must never serve production.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'fake'
  readonly dimensions: number
  /** Texts it has been asked to embed, in order (to assert what reached the provider). */
  readonly requests: string[][] = []
  constructor(dimensions: number = EMBEDDING_DIMENSIONS) {
    this.dimensions = dimensions
  }
  embed(texts: string[]): Promise<number[][]> {
    this.requests.push(texts)
    return Promise.resolve(texts.map((t) => embedOne(t, this.dimensions)))
  }
}
