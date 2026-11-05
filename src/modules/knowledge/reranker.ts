/**
 * `Reranker` — the seam where a later reranker/verifier (e.g. JEV) plugs in
 * between retrieval and the LLM without touching the UI or the copilot's
 * main logic (Fase 8). Only the identity implementation exists: it keeps the
 * retrieval order untouched and calls nothing external. A real one is
 * registered with `registerReranker`; never add a call just because a
 * service is available.
 */
import "server-only";
import type { KnowledgeSearchResult } from "@/modules/knowledge/retrieval";

export interface RankedChunk {
  chunk: KnowledgeSearchResult;
  /** Ordering score assigned by the reranker, higher first. */
  score: number;
}

export interface Reranker {
  readonly id: string;
  rerank(query: string, candidates: KnowledgeSearchResult[]): Promise<RankedChunk[]>;
}

/** No-op: keeps the retrieval order and its RRF score. */
export const identityReranker: Reranker = {
  id: "identity",
  async rerank(_query, candidates) {
    return candidates.map((chunk) => ({ chunk, score: chunk.score }));
  },
};

declare global {
  var __kindlyReranker: Reranker | undefined;
}

export function registerReranker(reranker: Reranker): void {
  globalThis.__kindlyReranker = reranker;
}

export function getReranker(): Reranker {
  return globalThis.__kindlyReranker ?? identityReranker;
}

export function clearReranker(): void {
  globalThis.__kindlyReranker = undefined;
}
