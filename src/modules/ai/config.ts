/**
 * Copilot tuning knobs, read from the environment so they can be calibrated
 * with the evaluation dataset without a deploy-time code change.
 */
import "server-only";

/**
 * Minimum cosine similarity for a vector-only candidate to be offered to the
 * model. Deliberately lenient (prefer extra candidates to lost recall; the
 * model's own abstention is the second guard). `text-embedding-3-small`
 * typically scores clearly unrelated Spanish text under ~0.2. Candidates that
 * also match the query lexically are always kept.
 */
export const DEFAULT_MIN_SIMILARITY = 0.25;

export function getMinSimilarity(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.KNOWLEDGE_MIN_SIMILARITY;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MIN_SIMILARITY;
  const value = Number(raw);
  return Number.isFinite(value) && value >= -1 && value <= 1 ? value : DEFAULT_MIN_SIMILARITY;
}
