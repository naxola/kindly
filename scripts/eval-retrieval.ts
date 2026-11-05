/**
 * Operator tool: measure retrieval quality against a dataset of real
 * questions (`tests/eval/README.md`) — recall@k, MRR, how many relevant
 * chunks survive the copilot's relevance gate, and how cleanly unanswerable
 * questions end with nothing offered. Read-only. Same
 * `NODE_OPTIONS=--conditions=react-server` pattern as the other scripts.
 *
 * Usage (fish):
 *   env DATABASE_URL='<url>' OPENAI_API_KEY='<key>' npm run eval:retrieval -- \
 *     --dataset tests/eval/dataset.jsonl [--organization-id <uuid>] [--limit 8] [--verbose]
 *   (--provider fake for dev only: vectors carry no meaning)
 *
 * Without --organization-id only GLOBAL knowledge is searched (a random
 * organization id, which owns nothing).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function registerProvider(fake: boolean) {
  const { registerEmbeddingProvider } = await import("@/modules/knowledge/embedding-provider");
  if (fake) {
    console.warn("[eval:retrieval] --provider fake: vectors are meaningless; results only exercise the pipeline.");
    const { createFakeEmbeddingProvider } = await import("@/modules/knowledge/testing/fake-embedding-provider");
    registerEmbeddingProvider(createFakeEmbeddingProvider());
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set. Set it or pass --provider fake.");
  const { OpenAIEmbeddingProvider } = await import("@/modules/knowledge/openai-embedding-provider");
  registerEmbeddingProvider(new OpenAIEmbeddingProvider({ apiKey, model: process.env.OPENAI_EMBEDDING_MODEL || undefined }));
}

async function main() {
  const datasetPath = arg("dataset");
  if (!datasetPath) throw new Error("Missing --dataset <file.jsonl>.");
  const limit = Number(arg("limit") ?? 8);
  const organizationId = arg("organization-id") ?? randomUUID();
  const verbose = process.argv.includes("--verbose");
  await registerProvider(arg("provider") === "fake");

  const { parseEvalDataset, evaluateQuestion, summarize } = await import("@/modules/knowledge/evaluation");
  const { retrieveKnowledge } = await import("@/modules/knowledge/retrieval");
  const { isRelevantCandidate } = await import("@/modules/ai/domain");
  const { getMinSimilarity } = await import("@/modules/ai/config");

  const questions = parseEvalDataset(await readFile(datasetPath, "utf8"));
  const minSimilarity = getMinSimilarity();
  const results = [];
  for (const question of questions) {
    const retrieved = await retrieveKnowledge({
      organizationId,
      query: question.question,
      atDate: question.atDate,
      jurisdiction: question.jurisdiction,
      limit,
    });
    const result = evaluateQuestion(
      question,
      retrieved.map((r) => ({
        documentTitle: r.documentTitle,
        label: r.label,
        path: r.path,
        content: r.content,
        passedGate: isRelevantCandidate(r, minSimilarity),
      })),
    );
    results.push(result);
    if (verbose) {
      console.log(`${result.answerable ? "Q" : "N"} ${question.id}: rank=${result.rank ?? "-"} afterGate=${result.rankAfterGate ?? "-"} offered=${result.offered}`);
    }
  }

  const summary = summarize(results, [1, 3, 5, limit].filter((k, i, all) => all.indexOf(k) === i).sort((a, b) => a - b));
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  console.log(`Questions: ${questions.length} (${summary.answerable} answerable, ${summary.unanswerable} unanswerable) · min similarity ${minSimilarity}`);
  for (const [k, v] of Object.entries(summary.recallAtK)) console.log(`recall@${k}: ${pct(v)}`);
  console.log(`MRR: ${summary.mrr.toFixed(3)}`);
  console.log(`relevant chunk survives the gate: ${pct(summary.recallAfterGate)}`);
  if (summary.cleanAbstention !== null) console.log(`unanswerable with nothing offered: ${pct(summary.cleanAbstention)}`);
  console.log(`mean candidates offered to the model: ${summary.meanOffered.toFixed(1)}`);
  if (summary.misses.length > 0) console.log(`not found in top ${limit}: ${summary.misses.join(", ")}`);
}

// The shared postgres pool is never closed by this script (see ingest-knowledge.ts).
main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
