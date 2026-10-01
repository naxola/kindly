/**
 * Retrieval evaluation (Fase 8, paso 6): pure dataset parsing and metrics for
 * measuring `retrieveKnowledge` against a set of real questions with known
 * answers. No I/O here — `scripts/eval-retrieval.ts` runs the retrieval and
 * feeds the results in. Format and how to build the dataset: `tests/eval/README.md`.
 */
import { articleNumber } from "@/modules/knowledge/indexing";

/** A chunk that would answer the question. All given fields must match. */
export interface ExpectedSource {
  /** Case-insensitive, exact document title. */
  documentTitle: string;
  /** Article number, e.g. "34" (matched against the chunk's label/breadcrumb). */
  article?: string;
  /** Text the chunk's content must contain (case-insensitive) — for an apartado, e.g. "8. Las personas". */
  contains?: string;
}

export interface EvalQuestion {
  id: string;
  question: string;
  /** 'YYYY-MM-DD'; defaults to today. */
  atDate?: string;
  jurisdiction?: string;
  /** Empty = the knowledge base does not answer this: the copilot should abstain. */
  expected: ExpectedSource[];
}

export interface EvalChunk {
  documentTitle: string;
  label: string | null;
  path: string | null;
  content: string;
  /** Whether the candidate passes the relevance gate the copilot applies. */
  passedGate: boolean;
}

export function parseEvalDataset(jsonl: string): EvalQuestion[] {
  const questions: EvalQuestion[] = [];
  const ids = new Set<string>();
  jsonl.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("//")) return;
    const where = `line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSON at ${where}.`);
    }
    const q = value as Partial<EvalQuestion>;
    if (typeof q.id !== "string" || !q.id) throw new Error(`Missing "id" at ${where}.`);
    if (ids.has(q.id)) throw new Error(`Duplicate id "${q.id}" at ${where}.`);
    if (typeof q.question !== "string" || !q.question.trim()) throw new Error(`Missing "question" at ${where}.`);
    if (!Array.isArray(q.expected)) throw new Error(`"expected" must be an array at ${where} (empty = should abstain).`);
    for (const e of q.expected) {
      if (typeof e?.documentTitle !== "string" || !e.documentTitle) {
        throw new Error(`Each expected source needs a "documentTitle" at ${where}.`);
      }
    }
    if (q.atDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(q.atDate)) {
      throw new Error(`"atDate" must be YYYY-MM-DD at ${where}.`);
    }
    ids.add(q.id);
    questions.push({
      id: q.id,
      question: q.question,
      atDate: q.atDate,
      jurisdiction: q.jurisdiction,
      expected: q.expected,
    });
  });
  return questions;
}

export function chunkMatchesExpected(chunk: EvalChunk, expected: ExpectedSource): boolean {
  if (chunk.documentTitle.trim().toLowerCase() !== expected.documentTitle.trim().toLowerCase()) return false;
  if (expected.article !== undefined && articleNumber(chunk.path, chunk.label) !== expected.article.toLowerCase()) return false;
  if (expected.contains !== undefined && !chunk.content.toLowerCase().includes(expected.contains.toLowerCase())) return false;
  return true;
}

/** 1-indexed rank of the first retrieved chunk that matches any expected source, or null. */
export function firstRelevantRank(retrieved: EvalChunk[], expected: ExpectedSource[]): number | null {
  const index = retrieved.findIndex((chunk) => expected.some((e) => chunkMatchesExpected(chunk, e)));
  return index === -1 ? null : index + 1;
}

export interface QuestionResult {
  id: string;
  /** Null for an answerable question that was not found, or an unanswerable one. */
  rank: number | null;
  /** Rank within only the candidates that pass the relevance gate. */
  rankAfterGate: number | null;
  answerable: boolean;
  /** Candidates that pass the gate (what the model would be offered). */
  offered: number;
}

export function evaluateQuestion(question: EvalQuestion, retrieved: EvalChunk[]): QuestionResult {
  const gated = retrieved.filter((c) => c.passedGate);
  return {
    id: question.id,
    rank: firstRelevantRank(retrieved, question.expected),
    rankAfterGate: firstRelevantRank(gated, question.expected),
    answerable: question.expected.length > 0,
    offered: gated.length,
  };
}

export interface EvalSummary {
  answerable: number;
  unanswerable: number;
  /** Share of answerable questions with a relevant chunk in the top k, for each k. */
  recallAtK: Record<number, number>;
  /** Mean reciprocal rank over answerable questions (0 when not found). */
  mrr: number;
  /** Share of answerable questions whose relevant chunk survives the relevance gate (what the copilot can cite). */
  recallAfterGate: number;
  /** Share of unanswerable questions for which nothing passes the gate (a clean abstention upstream). */
  cleanAbstention: number | null;
  /** Mean number of candidates offered to the model. */
  meanOffered: number;
  /** Answerable questions not found in the top max(k), for review. */
  misses: string[];
}

export function summarize(results: QuestionResult[], ks: number[] = [1, 3, 5, 8]): EvalSummary {
  const answerable = results.filter((r) => r.answerable);
  const unanswerable = results.filter((r) => !r.answerable);
  const share = (count: number, total: number) => (total === 0 ? 0 : count / total);
  const recallAtK = Object.fromEntries(
    ks.map((k) => [k, share(answerable.filter((r) => r.rank !== null && r.rank <= k).length, answerable.length)]),
  );
  const maxK = Math.max(...ks);
  return {
    answerable: answerable.length,
    unanswerable: unanswerable.length,
    recallAtK,
    mrr: share(answerable.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0), answerable.length),
    recallAfterGate: share(answerable.filter((r) => r.rankAfterGate !== null).length, answerable.length),
    cleanAbstention: unanswerable.length === 0 ? null : share(unanswerable.filter((r) => r.offered === 0).length, unanswerable.length),
    meanOffered: share(results.reduce((sum, r) => sum + r.offered, 0), results.length),
    misses: answerable.filter((r) => r.rank === null || r.rank > maxK).map((r) => r.id),
  };
}
