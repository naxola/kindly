/**
 * Reciprocal Rank Fusion: combines several independently ranked lists of the same kind of item (here
 * full text results and vector results) into one ranking without needing their scores to be
 * comparable (`ts_rank` and cosine distance are not; rank position always is). An item at 1-indexed
 * rank `r` contributes `1 / (k + r)`; one that several lists agree on sums its contributions.
 * `k = 60` is the constant of the RRF literature.
 */
export const DEFAULT_RRF_K = 60

/**
 * Fuses the lists into one, deduplicated by `keyOf` and sorted by descending combined score. The
 * first list containing an item supplies its data; only `score` is added on top.
 */
export function combineRankedResults<T>(
  lists: readonly (readonly T[])[],
  keyOf: (item: T) => string,
  k: number = DEFAULT_RRF_K,
): (T & { score: number })[] {
  const scores = new Map<string, number>()
  const items = new Map<string, T>()
  for (const list of lists) {
    list.forEach((item, index) => {
      const key = keyOf(item)
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + index + 1))
      if (!items.has(key)) items.set(key, item)
    })
  }
  return [...items.entries()]
    .map(([key, item]) => ({ ...item, score: scores.get(key)! }))
    .sort((a, b) => b.score - a.score)
}
