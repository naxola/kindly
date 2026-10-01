/**
 * What a knowledge chunk is *indexed* as (Fase 8, paso 1). Pure, no I/O.
 *
 * `content` is what Kindly shows and cites; `search_text` is what both the
 * FTS column and the embedding are computed from: the chunk's full legal
 * context (document → título/capítulo/sección → artículo → apartados →
 * subapartados) followed by the complete content. Without it a chunk that
 * says "8. Las personas trabajadoras tienen derecho…" cannot match
 * "art. 34.8", and its embedding knows nothing of the law it belongs to.
 *
 * Apartado detection is best effort, like the chunker: numbers at the start
 * of a line ("8. Texto") are trusted; numbers inside a line (PDF extraction
 * often collapses an article onto one line) only count as part of a
 * consecutive run ("1. … 2. … 3. …"), which filters out stray "2024. " and
 * similar false positives.
 */

export interface SearchTextInput {
  documentTitle: string;
  /** Breadcrumb from the chunker, e.g. "Título I > Capítulo II > Artículo 34". */
  path: string | null;
  /** e.g. "Artículo 34" or "Artículo 34 (parte 2)". */
  label: string | null;
  content: string;
}

const ARTICLE_PATTERN = /art[ií]culo\s+(\d+[a-z]*)/iu;

/** Article number from the most specific place that names one (label, then the breadcrumb's last segment). */
export function articleNumber(path: string | null, label: string | null): string | null {
  const fromLabel = label ? ARTICLE_PATTERN.exec(label) : null;
  if (fromLabel) return fromLabel[1].toLowerCase();
  const segments = path ? path.split(">").map((s) => s.trim()) : [];
  for (let i = segments.length - 1; i >= 0; i--) {
    const m = ARTICLE_PATTERN.exec(segments[i]);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

interface Marker {
  value: string;
  index: number;
}

const LINE_START_APARTADO = /^[ \t]*(\d{1,3})\.[ \t]+\S/gmu;
const INLINE_APARTADO = /(?:^|[\s.;:])(\d{1,3})\.\s+(?=[A-ZÁÉÍÓÚÑ¿«"])/gu;
const SUBAPARTADO = /(?:^|[\s(])([a-zñ])\)\s/gu;

function collect(pattern: RegExp, text: string): Marker[] {
  const out: Marker[] = [];
  for (const m of text.matchAll(pattern)) {
    out.push({ value: m[1], index: m.index ?? 0 });
  }
  return out;
}

/** Inline candidates that belong to a run of consecutive numbers (length ≥ 2). */
function consecutiveRuns(candidates: Marker[]): Marker[] {
  const kept: Marker[] = [];
  let run: Marker[] = [];
  const flush = () => {
    if (run.length >= 2) kept.push(...run);
    run = [];
  };
  for (const c of candidates) {
    const last = run[run.length - 1];
    if (last && Number(c.value) === Number(last.value) + 1) {
      run.push(c);
    } else {
      flush();
      run = [c];
    }
  }
  flush();
  return kept;
}

/** Apartado numbers in `content`, in order of appearance, deduplicated. */
export function detectApartados(content: string): Marker[] {
  const lineStart = collect(LINE_START_APARTADO, content);
  const inline = consecutiveRuns(collect(INLINE_APARTADO, content));
  const byIndex = new Map<number, Marker>();
  for (const m of [...lineStart, ...inline]) {
    // The inline pattern's match may start one character earlier (the separator).
    const near = [...byIndex.keys()].find((k) => Math.abs(k - m.index) <= 2);
    if (near === undefined) byIndex.set(m.index, m);
  }
  const ordered = [...byIndex.values()].sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  return ordered.filter((m) => (seen.has(m.value) ? false : (seen.add(m.value), true)));
}

/** "a)", "b)"… each attached to the closest preceding apartado. */
function detectSubapartados(content: string, apartados: Marker[]): { apartado: string; letter: string }[] {
  const out: { apartado: string; letter: string }[] = [];
  const seen = new Set<string>();
  for (const sub of collect(SUBAPARTADO, content)) {
    const parent = [...apartados].reverse().find((a) => a.index < sub.index);
    if (!parent) continue;
    const key = `${parent.value}.${sub.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ apartado: parent.value, letter: sub.value });
    }
  }
  return out;
}

/**
 * The text a chunk is indexed and embedded as: a header with its full
 * hierarchical context, a blank line, then the complete content.
 */
export function buildSearchText(input: SearchTextInput): string {
  const lines: string[] = [`Documento: ${input.documentTitle.trim()}`];
  if (input.path) lines.push(`Ubicación: ${input.path}`);
  if (input.label && input.label !== input.path?.split(">").pop()?.trim()) {
    lines.push(`Fragmento: ${input.label}`);
  }

  const article = articleNumber(input.path, input.label);
  if (article) {
    const apartados = detectApartados(input.content);
    for (const apartado of apartados) {
      lines.push(`Artículo ${article}, apartado ${apartado.value} (art. ${article}.${apartado.value})`);
    }
    for (const sub of detectSubapartados(input.content, apartados)) {
      lines.push(
        `Artículo ${article}, apartado ${sub.apartado}, letra ${sub.letter}) (art. ${article}.${sub.apartado}.${sub.letter})`,
      );
    }
  }

  return `${lines.join("\n")}\n\n${input.content}`;
}

/**
 * Normalizes legal references in a user query so FTS can match the
 * indexed form: "art." → "artículo", and "artículo 34 apartado 8" /
 * "apartado 8 del artículo 34" gain the compact token "34.8".
 */
export function normalizeLegalReferences(query: string): string {
  let q = query.replace(/\barts?\.?\s*(?=\d)/giu, "artículo ");
  const extra: string[] = [];
  for (const m of q.matchAll(/art[ií]culo\s+(\d+)\s*,?\s*(?:apartado|apdo\.?|ap\.?)\s*(\d+)/giu)) {
    extra.push(`${m[1]}.${m[2]}`);
  }
  for (const m of q.matchAll(/(?:apartado|apdo\.?)\s*(\d+)\s*(?:,\s*)?del\s+art[ií]culo\s+(\d+)/giu)) {
    extra.push(`${m[2]}.${m[1]}`);
  }
  q = q.replace(/\bapdo\.?\s*(?=\d)/giu, "apartado ");
  return extra.length > 0 ? `${q} ${extra.join(" ")}` : q;
}
