import { describe, expect, it } from "vitest";
import {
  chunkMatchesExpected,
  evaluateQuestion,
  firstRelevantRank,
  parseEvalDataset,
  summarize,
  type EvalChunk,
  type EvalQuestion,
} from "@/modules/knowledge/evaluation";

const chunk = (overrides: Partial<EvalChunk> = {}): EvalChunk => ({
  documentTitle: "Estatuto de los Trabajadores",
  label: "Artículo 34",
  path: "Título I > Artículo 34",
  content: "8. Las personas trabajadoras tienen derecho a solicitar adaptaciones.",
  passedGate: true,
  ...overrides,
});

describe("parseEvalDataset", () => {
  it("parses JSONL, ignoring blank lines and // comments", () => {
    const questions = parseEvalDataset(
      '// comentario\n\n{"id":"a","question":"¿Plazo?","expected":[{"documentTitle":"Ley","article":"5"}]}\n{"id":"b","question":"¿Capital?","expected":[]}\n',
    );
    expect(questions.map((q) => q.id)).toEqual(["a", "b"]);
    expect(questions[1].expected).toEqual([]);
  });

  it("rejects malformed lines with the line number", () => {
    expect(() => parseEvalDataset("not json")).toThrow(/line 1/);
    expect(() => parseEvalDataset('{"question":"x","expected":[]}')).toThrow(/"id".*line 1/);
    expect(() => parseEvalDataset('{"id":"a","question":"x"}')).toThrow(/"expected"/);
    expect(() => parseEvalDataset('{"id":"a","question":"x","expected":[{}]}')).toThrow(/documentTitle/);
    expect(() => parseEvalDataset('{"id":"a","question":"x","expected":[],"atDate":"1/1/2024"}')).toThrow(/atDate/);
    expect(() => parseEvalDataset('{"id":"a","question":"x","expected":[]}\n{"id":"a","question":"y","expected":[]}')).toThrow(/Duplicate id "a"/);
  });
});

describe("chunkMatchesExpected", () => {
  it("requires every given field to match, case-insensitively", () => {
    expect(chunkMatchesExpected(chunk(), { documentTitle: "estatuto de los trabajadores" })).toBe(true);
    expect(chunkMatchesExpected(chunk(), { documentTitle: "Estatuto de los Trabajadores", article: "34" })).toBe(true);
    expect(chunkMatchesExpected(chunk(), { documentTitle: "Estatuto de los Trabajadores", article: "35" })).toBe(false);
    expect(chunkMatchesExpected(chunk(), { documentTitle: "Otra ley" })).toBe(false);
    expect(chunkMatchesExpected(chunk(), { documentTitle: "Estatuto de los Trabajadores", contains: "8. LAS PERSONAS" })).toBe(true);
    expect(chunkMatchesExpected(chunk(), { documentTitle: "Estatuto de los Trabajadores", contains: "9. Las" })).toBe(false);
  });
});

describe("evaluation metrics", () => {
  const answerable: EvalQuestion = { id: "q", question: "?", expected: [{ documentTitle: "Estatuto de los Trabajadores", article: "34" }] };

  it("finds the first relevant rank", () => {
    const retrieved = [chunk({ label: "Artículo 1", path: "Artículo 1" }), chunk({ label: "Artículo 34" })];
    expect(firstRelevantRank(retrieved, answerable.expected)).toBe(2);
    expect(firstRelevantRank([], answerable.expected)).toBeNull();
  });

  it("tracks rank before and after the relevance gate", () => {
    const result = evaluateQuestion(answerable, [chunk({ passedGate: false }), chunk({ label: "Artículo 1", path: "Artículo 1" })]);
    expect(result).toMatchObject({ rank: 1, rankAfterGate: null, answerable: true, offered: 1 });
  });

  it("summarizes recall@k, MRR, gate survival, clean abstention and misses", () => {
    const miss = chunk({ label: "Artículo 1", path: "Artículo 1" });
    const results = [
      evaluateQuestion({ ...answerable, id: "hit1" }, [chunk()]),
      evaluateQuestion({ ...answerable, id: "hit3" }, [miss, miss, chunk()]),
      evaluateQuestion({ ...answerable, id: "none" }, [miss]),
      evaluateQuestion({ id: "neg-clean", question: "?", expected: [] }, [chunk({ passedGate: false })]),
      evaluateQuestion({ id: "neg-leak", question: "?", expected: [] }, [chunk()]),
    ];
    const summary = summarize(results, [1, 3]);
    expect(summary.answerable).toBe(3);
    expect(summary.unanswerable).toBe(2);
    expect(summary.recallAtK[1]).toBeCloseTo(1 / 3);
    expect(summary.recallAtK[3]).toBeCloseTo(2 / 3);
    expect(summary.mrr).toBeCloseTo((1 + 1 / 3 + 0) / 3);
    expect(summary.recallAfterGate).toBeCloseTo(2 / 3);
    expect(summary.cleanAbstention).toBe(0.5);
    expect(summary.misses).toEqual(["none"]);
  });

  it("has no clean-abstention figure without unanswerable questions", () => {
    expect(summarize([evaluateQuestion(answerable, [chunk()])]).cleanAbstention).toBeNull();
  });
});
