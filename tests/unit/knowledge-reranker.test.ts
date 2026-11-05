import { afterEach, describe, expect, it } from "vitest";
import { clearReranker, getReranker, identityReranker, registerReranker } from "@/modules/knowledge/reranker";
import type { KnowledgeSearchResult } from "@/modules/knowledge/retrieval";

const chunk = (id: string, score: number) => ({ chunkId: id, score }) as KnowledgeSearchResult;

afterEach(() => clearReranker());

describe("Reranker", () => {
  it("defaults to the identity implementation: same order, same scores, no side effects", async () => {
    const candidates = [chunk("a", 0.9), chunk("b", 0.5)];
    const ranked = await getReranker().rerank("consulta", candidates);
    expect(getReranker().id).toBe("identity");
    expect(ranked.map((r) => r.chunk.chunkId)).toEqual(["a", "b"]);
    expect(ranked.map((r) => r.score)).toEqual([0.9, 0.5]);
    expect(candidates.map((c) => c.chunkId)).toEqual(["a", "b"]);
  });

  it("lets a later implementation be registered without changing callers", async () => {
    registerReranker({
      id: "reverse",
      rerank: async (_q, cs) => cs.map((c, i) => ({ chunk: c, score: i })).reverse(),
    });
    expect(getReranker().id).toBe("reverse");
    expect((await getReranker().rerank("q", [chunk("a", 1), chunk("b", 2)])).map((r) => r.chunk.chunkId)).toEqual(["b", "a"]);
    expect(identityReranker.id).toBe("identity");
  });
});
