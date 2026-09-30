/** Pure procedure logic — no DB, no I/O. */

/**
 * One item per non-empty line, trimmed, in order. Exact duplicates are
 * dropped (a document listed twice would show up as two "missing" rows).
 * Used to turn the admin form's textareas into steps / required documents.
 */
export function parseLineList(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const item = raw.trim();
    if (item && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }
  return items;
}
