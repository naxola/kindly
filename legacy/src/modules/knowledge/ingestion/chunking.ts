/**
 * Pure text → `ChunkInput[]` chunker (Fase 7b). No DB, no I/O, so it
 * unit-tests directly — same spirit as `knowledge/domain.ts`.
 *
 * Best-effort structural chunking for Spanish normative text
 * (`docs/DATABASE.md` §14: "cuando sea posible, se conserva la jerarquía
 * real del documento"), not a full legal-document parser. It recognizes the
 * three heading markers that matter for `KnowledgeChunkLevel`:
 *
 *   TÍTULO/CAPÍTULO → tracked in the breadcrumb, drives `CHAPTER`
 *   SECCIÓN         → drives `SECTION`
 *   ARTÍCULO        → drives `ARTICLE`
 *
 * Each chunk's `level` is the granularity of *that specific row's content*,
 * not "one row per hierarchy level" (the schema has no parent/child edges
 * between chunks — `path` carries the full breadcrumb as text instead):
 *
 *   - A whole recognized unit (chapter/section/article) that fits in one
 *     chunk keeps that unit's own level (`CHAPTER`/`SECTION`/`ARTICLE`).
 *   - A unit too long for one chunk is split by paragraph (`PARAGRAPH`).
 *   - A paragraph still too long is sliced by fixed size (`FRAGMENT`) —
 *     also the level for every chunk of text with no recognized structure
 *     at all (a generic web page, an internal manual).
 *
 * `TÍTULO` has no level of its own (the enum has no rank above `CHAPTER`):
 * it only contributes to the breadcrumb so citations keep it, exactly like
 * `CAPÍTULO` drives `CHAPTER` for the unit that follows it.
 *
 * A heading's own label is deliberately kept short (e.g. "Artículo 5"), not
 * whatever title text follows it on the same line: PDF extraction often
 * collapses a whole article onto one line, so "rest of the heading line" is
 * frequently body prose, not a title — it is always pushed into the unit's
 * body instead of the label, so nothing from the source is ever dropped.
 */
import type { ChunkInput } from "@/modules/knowledge/service";

/** Target size for a chunk's embedded content — see module header. */
const MAX_CHUNK_CHARS = 1800;

interface HeadingMatch {
  kind: "TITULO" | "CAPITULO" | "SECCION" | "ARTICULO";
  label: string;
  /** Any text on the same line after the heading marker — body, not title. */
  trailing: string;
}

// Matches a heading at the start of a line: "Artículo 5.", "CAPÍTULO III —",
// "Sección 2:", "Título I.", case-insensitive, with or without accents.
const HEADING_PATTERN =
  /^(t[ií]tulo|cap[ií]tulo|secci[oó]n|art[ií]culo)\s+([ivxlcdm\d]+[ºª]?)\s*[.:\-—]?\s*(.*)$/iu;

function matchHeading(line: string): HeadingMatch | null {
  const m = HEADING_PATTERN.exec(line.trim());
  if (!m) return null;

  const [, word, number, trailing] = m;
  const normalized = word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents: "título" -> "titulo"

  const kind =
    normalized === "titulo"
      ? "TITULO"
      : normalized === "capitulo"
        ? "CAPITULO"
        : normalized === "seccion"
          ? "SECCION"
          : "ARTICULO";

  const titleCaseWord = word[0].toUpperCase() + word.slice(1).toLowerCase();
  return { kind, label: `${titleCaseWord} ${number}`, trailing: trailing.trim() };
}

interface Context {
  titulo: string | null;
  capitulo: string | null;
  seccion: string | null;
  articulo: string | null;
}

function breadcrumb(ctx: Context): string | null {
  const parts = [ctx.titulo, ctx.capitulo, ctx.seccion, ctx.articulo].filter(
    (p): p is string => p !== null,
  );
  return parts.length > 0 ? parts.join(" > ") : null;
}

/** The most specific unit currently open — what a whole, unsplit chunk's `label` is. */
function currentLabel(ctx: Context): string | null {
  return ctx.articulo ?? ctx.seccion ?? ctx.capitulo ?? ctx.titulo ?? null;
}

/** The level a whole, unsplit chunk gets for the currently open unit. */
function currentLevel(ctx: Context): ChunkInput["level"] {
  if (ctx.articulo) return "ARTICLE";
  if (ctx.seccion) return "SECTION";
  if (ctx.capitulo) return "CHAPTER";
  return "FRAGMENT";
}

/** Split `text` into paragraphs on blank lines, dropping empty ones. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Split `text` into `<= MAX_CHUNK_CHARS` pieces, preferring sentence boundaries. */
function splitFixedSize(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHUNK_CHARS) {
    return trimmed ? [trimmed] : [];
  }

  const pieces: string[] = [];
  let rest = trimmed;
  while (rest.length > MAX_CHUNK_CHARS) {
    const window = rest.slice(0, MAX_CHUNK_CHARS);
    // Prefer cutting after the last sentence-ending punctuation in the
    // window; fall back to the last space; fall back to a hard cut.
    const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"));
    const lastSpace = window.lastIndexOf(" ");
    const cut = sentenceEnd > MAX_CHUNK_CHARS * 0.5 ? sentenceEnd + 1 : lastSpace > 0 ? lastSpace : MAX_CHUNK_CHARS;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * Turn a unit's accumulated body (everything between one heading and the
 * next, including any trailing text from the heading line itself) into one
 * or more chunks, splitting only as much as needed.
 */
function chunkifyUnit(ctx: Context, body: string): Omit<ChunkInput, "ordinal">[] {
  const trimmed = body.trim();
  const path = breadcrumb(ctx);
  const label = currentLabel(ctx);

  if (!trimmed) {
    return [];
  }

  if (trimmed.length <= MAX_CHUNK_CHARS) {
    return [{ level: currentLevel(ctx), label, path, content: trimmed }];
  }

  // Too long for one chunk: split by paragraph (PARAGRAPH level), further
  // splitting any paragraph still too long by fixed size (FRAGMENT level).
  const paragraphs = splitParagraphs(trimmed);
  // A "paragraph" split that produced only one piece (no blank lines at
  // all) isn't a real paragraph split — treat the whole body as one
  // oversized paragraph so it goes straight to fixed-size FRAGMENT pieces.
  const isMultiParagraph = paragraphs.length > 1;
  const units = isMultiParagraph ? paragraphs : [trimmed];

  const chunks: Omit<ChunkInput, "ordinal">[] = [];
  for (const [i, unit] of units.entries()) {
    const partLabel = label ? (isMultiParagraph ? `${label} (parte ${i + 1})` : label) : null;
    if (unit.length <= MAX_CHUNK_CHARS) {
      chunks.push({
        level: isMultiParagraph ? "PARAGRAPH" : "FRAGMENT",
        label: partLabel,
        path,
        content: unit,
      });
    } else {
      const pieces = splitFixedSize(unit);
      for (const [j, piece] of pieces.entries()) {
        chunks.push({
          level: "FRAGMENT",
          label: partLabel ? `${partLabel} — ${j + 1}/${pieces.length}` : null,
          path,
          content: piece,
        });
      }
    }
  }

  return chunks;
}

/**
 * Chunk a plain-text document into hierarchical, embeddable pieces. See
 * module header for the heuristic.
 */
export function chunkDocumentText(text: string): ChunkInput[] {
  const lines = text.split(/\r\n|\r|\n/);

  const ctx: Context = { titulo: null, capitulo: null, seccion: null, articulo: null };
  let buffer: string[] = [];
  const result: ChunkInput[] = [];
  let ordinal = 0;

  function flush() {
    for (const chunk of chunkifyUnit(ctx, buffer.join("\n"))) {
      result.push({ ordinal: ordinal++, ...chunk });
    }
    buffer = [];
  }

  for (const rawLine of lines) {
    const heading = matchHeading(rawLine);
    if (heading) {
      flush();
      if (heading.kind === "TITULO") {
        ctx.titulo = heading.label;
        ctx.capitulo = null;
        ctx.seccion = null;
        ctx.articulo = null;
      } else if (heading.kind === "CAPITULO") {
        ctx.capitulo = heading.label;
        ctx.seccion = null;
        ctx.articulo = null;
      } else if (heading.kind === "SECCION") {
        ctx.seccion = heading.label;
        ctx.articulo = null;
      } else {
        ctx.articulo = heading.label;
      }
      if (heading.trailing) {
        buffer.push(heading.trailing);
      }
      continue;
    }
    buffer.push(rawLine);
  }
  flush();

  return result;
}
