/**
 * One item per non-empty line, trimmed, in order. Exact duplicates are dropped (a document listed
 * twice would show up as two "missing" rows).
 */
export function parseLineList(text: string): string[] {
  return normalizeList(text.split(/\r?\n/))
}

/** The same rule for a list that already arrives split. */
export function normalizeList(items: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    const item = raw.trim()
    if (item && !seen.has(item)) {
      seen.add(item)
      out.push(item)
    }
  }
  return out
}
