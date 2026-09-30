import { describe, expect, it } from "vitest";
import { combineRankedResults, DEFAULT_RRF_K } from "@/modules/knowledge/retrieval-fusion";

/**
 * Unit tests for Reciprocal Rank Fusion (Fase 7c). Pure, no DB.
 */

interface Item {
  id: string;
  label: string;
}

const item = (id: string): Item => ({ id, label: `item-${id}` });

describe("combineRankedResults", () => {
  it("keeps a single list's order when there is only one list", () => {
    const list = [item("a"), item("b"), item("c")];
    const result = combineRankedResults([list], (i) => i.id);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for no lists or all-empty lists", () => {
    expect(combineRankedResults([], (i: Item) => i.id)).toEqual([]);
    expect(combineRankedResults([[], []], (i: Item) => i.id)).toEqual([]);
  });

  it("sums contributions across lists, so an item in both outranks one in only one", () => {
    // "a" is #1 in list 1 and #1 in list 2; "b" is #1 in list 1 only.
    const list1 = [item("a"), item("b")];
    const list2 = [item("a"), item("c")];
    const result = combineRankedResults([list1, list2], (i) => i.id);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result[0].score).toBeCloseTo(2 / (DEFAULT_RRF_K + 1), 10);
  });

  it("computes the exact RRF score for a known case", () => {
    // "a" ranked #1 in list1, #2 in list2.
    const list1 = [item("a"), item("b")];
    const list2 = [item("c"), item("a")];
    const result = combineRankedResults([list1, list2], (i) => i.id, 60);
    const a = result.find((r) => r.id === "a")!;
    expect(a.score).toBeCloseTo(1 / 61 + 1 / 62, 10);
  });

  it("dedupes an item appearing in multiple lists, keeping the first list's data", () => {
    const list1 = [{ id: "a", label: "from-list-1" }];
    const list2 = [{ id: "a", label: "from-list-2" }];
    const result = combineRankedResults([list1, list2], (i) => i.id);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("from-list-1");
  });

  it("includes an item present in only one of several lists", () => {
    const result = combineRankedResults([[item("a")], [item("b")], []], (i) => i.id);
    expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("respects a custom k", () => {
    const list = [item("a")];
    const withDefaultK = combineRankedResults([list], (i) => i.id);
    const withSmallK = combineRankedResults([list], (i) => i.id, 1);
    expect(withSmallK[0].score).toBeGreaterThan(withDefaultK[0].score);
  });

  it("supports more than two lists", () => {
    const result = combineRankedResults(
      [[item("a"), item("b")], [item("b"), item("a")], [item("a")]],
      (i) => i.id,
    );
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
