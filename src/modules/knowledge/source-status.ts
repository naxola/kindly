/**
 * Index status of a knowledge source, derived from its chunks — never stored,
 * so it cannot drift from what retrieval actually uses. Pure (no I/O).
 *
 *  - `INDEXED`: every chunk was embedded by the active provider.
 *  - `OUTDATED`: some chunk was embedded by another model (provider switched,
 *    or the `legacy` marker of migration 0012); vector search skips those
 *    until a reindex.
 *  - `EMPTY`: the source has no chunks, so nothing can be retrieved from it.
 *  - `UNKNOWN`: no embedding provider is registered here, so it cannot be told.
 */
export type IndexStatus = "INDEXED" | "OUTDATED" | "EMPTY" | "UNKNOWN";

export function deriveIndexStatus(input: {
  chunkCount: number;
  staleChunkCount: number;
  providerKnown: boolean;
}): IndexStatus {
  if (input.chunkCount === 0) return "EMPTY";
  if (!input.providerKnown) return "UNKNOWN";
  return input.staleChunkCount > 0 ? "OUTDATED" : "INDEXED";
}

/** "12.345 caracteres" style count, with `es-ES` grouping fixed so server and client agree. */
export function formatCharacterCount(count: number): string {
  return new Intl.NumberFormat("es-ES", { useGrouping: "always" }).format(count);
}

/** What the organization's own sources cost to index (public GLOBAL knowledge is not its cost). */
export function summarizeUsage(
  sources: { visibility: "GLOBAL" | "ORGANIZATION"; chunkCount: number; characterCount: number }[],
): { sourceCount: number; chunkCount: number; characterCount: number } {
  const own = sources.filter((source) => source.visibility === "ORGANIZATION");
  return {
    sourceCount: own.length,
    chunkCount: own.reduce((sum, source) => sum + source.chunkCount, 0),
    characterCount: own.reduce((sum, source) => sum + source.characterCount, 0),
  };
}

export interface SourceFilters {
  /** Case/accent-insensitive substring of the title. */
  text?: string;
  /** Exact source type; anything else means "all". */
  type?: string;
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function filterSources<T extends { title: string; sourceType: string }>(sources: T[], filters: SourceFilters): T[] {
  const text = filters.text ? normalize(filters.text.trim()) : "";
  return sources.filter(
    (source) =>
      (!filters.type || source.sourceType === filters.type) && (!text || normalize(source.title).includes(text)),
  );
}

export type WebsitePageState = "DISCOVERED" | "PENDING" | "INDEXING" | "INDEXED" | "FAILED";

/** How many pages of a website are in each state. `waiting` = queued or being indexed; `done` once none is. */
export function summarizeWebsite(pages: { status: WebsitePageState }[]): {
  total: number;
  discovered: number;
  pending: number;
  indexing: number;
  indexed: number;
  failed: number;
  waiting: number;
  done: boolean;
} {
  const count = (status: WebsitePageState) => pages.filter((page) => page.status === status).length;
  const pending = count("PENDING");
  const indexing = count("INDEXING");
  return {
    total: pages.length,
    discovered: count("DISCOVERED"),
    pending,
    indexing,
    indexed: count("INDEXED"),
    failed: count("FAILED"),
    waiting: pending + indexing,
    done: pending + indexing === 0,
  };
}

/** Pages of one table page: `page` is 0-based and clamped, so a shrinking list never shows an empty page. */
export function paginate<T>(items: T[], page: number, pageSize: number): { rows: T[]; page: number; pageCount: number; from: number; to: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(0, page), pageCount - 1);
  const start = current * pageSize;
  const rows = items.slice(start, start + pageSize);
  return { rows, page: current, pageCount, from: rows.length === 0 ? 0 : start + 1, to: start + rows.length };
}

/** Pages of a website that can be imported in one go (bounds the embedding bill of a single action). */
export const MAX_IMPORT_PAGES = 30;
