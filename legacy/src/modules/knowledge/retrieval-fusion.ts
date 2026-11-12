/**
 * Reciprocal Rank Fusion (RRF) — pure, no DB, no I/O (Fase 7c). Combines
 * several independently-ranked lists of the same kind of item (here: full
 * text search results and vector similarity results) into one ranking,
 * without needing their scores to be on the same scale — `ts_rank` and
 * cosine distance aren't comparable, but rank *position* always is.
 *
 * For each list, an item at 1-indexed rank `r` contributes `1 / (k + r)`;
 * an item appearing in several lists sums its contributions from each,
 * which is exactly how RRF rewards items multiple retrieval methods agree
 * on. `k = 60` is the standard constant from the RRF literature (also what
 * Supabase's hybrid search guide uses — this project's own reference for
 * quality patterns).
 */

/** The standard RRF constant — see module header. */
export const DEFAULT_RRF_K = 60;

/**
 * Fuse several ranked lists into one, deduped by `keyOf`, sorted by
 * descending combined score. The first list containing an item supplies
 * its data; only `score` is added on top.
 */
export function combineRankedResults<T>(
  lists: readonly (readonly T[])[],
  keyOf: (item: T) => string,
  k: number = DEFAULT_RRF_K,
): (T & { score: number })[] {
  const scores = new Map<string, number>();
  const items = new Map<string, T>();

  for (const list of lists) {
    list.forEach((item, index) => {
      const key = keyOf(item);
      const rank = index + 1; // 1-indexed, as the RRF formula expects.
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank));
      if (!items.has(key)) {
        items.set(key, item);
      }
    });
  }

  return [...items.entries()]
    .map(([key, item]) => ({ ...item, score: scores.get(key)! }))
    .sort((a, b) => b.score - a.score);
}
