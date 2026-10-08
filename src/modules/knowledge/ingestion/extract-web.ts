/**
 * Web page → plain text extraction (Fase 7b). Two pieces on purpose:
 *
 *  - `htmlToText` is pure (no network) — unit-tested directly.
 *  - `fetchWebText` does the actual fetch, with `fetchImpl` injectable so
 *    tests never hit a real network (`CLAUDE.md` §6), same pattern as
 *    `ResendEmailSender` (`email/resend.ts`).
 *
 * No HTML parsing library (cheerio/jsdom) is added for this — a regex-based
 * stripper is enough for official legal/regulatory pages, which are static
 * HTML, and keeps the production bundle free of a DOM implementation
 * (`CLAUDE.md` §2: no infraestructura sin necesidad concreta).
 */

const BLOCK_TAGS =
  /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|blockquote)\b[^>]*>/gi;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const codePoint = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    const lower = code.toLowerCase();
    return lower in ENTITIES ? ENTITIES[lower] : match;
  });
}

/**
 * Strip an HTML document down to its readable text, preserving paragraph
 * boundaries (block-level tags become newlines) so the chunker
 * (`chunking.ts`) can still find structure in the result.
 */
export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const withBreaks = withoutNoise.replace(BLOCK_TAGS, "\n");
  const withoutTags = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = decodeEntities(withoutTags);

  return decoded
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

import { assertPublicHost, type HostResolver } from "@/modules/knowledge/ingestion/network-guard";

const MAX_REDIRECTS = 5;

export interface FetchWebTextOptions {
  /** Injectable for tests — never a real DNS lookup in CI. */
  resolveHost?: HostResolver;
  /** Injectable for tests — never a real network call in CI. */
  fetchImpl?: typeof fetch;
  /** Hard cap on the response body size, to avoid pathological memory use. */
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

/**
 * Fetch a URL and return its body and final address. Rejects any protocol but
 * http(s), and (Fase 7f, the URL now comes from the UI) any host that does
 * not resolve to a public address — re-checked on every redirect hop, which
 * are followed manually for exactly that reason.
 */
export async function fetchGuarded(
  url: string,
  options: FetchWebTextOptions = {},
): Promise<{ body: string; finalUrl: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  let current = new URL(url);
  let response: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new Error(`Refusing to fetch a non-http(s) URL: ${current.href}`);
    }
    await assertPublicHost(current, options.resolveHost);

    response = await fetchImpl(current, { redirect: "manual" });
    const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
    if (!location) {
      break;
    }
    current = new URL(location, current);
    response = undefined;
  }
  if (!response) {
    throw new Error(`Fetching ${url} failed: too many redirects.`);
  }
  if (!response.ok) {
    throw new Error(`Fetching ${url} failed: HTTP ${response.status}`);
  }

  const body = await response.text();
  if (body.length > maxBytes) {
    throw new Error(`Response from ${url} exceeds the ${maxBytes}-byte limit.`);
  }
  return { body, finalUrl: current.href };
}

/** The page `<title>` (entities decoded, whitespace collapsed), or null when there is none. */
export function extractTitle(html: string): string | null {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const title = decodeEntities(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return title || null;
}

/** Fetch a web page and return its extracted text. */
export async function fetchWebText(url: string, options: FetchWebTextOptions = {}): Promise<string> {
  return htmlToText((await fetchGuarded(url, options)).body);
}

/** Fetch a web page and return its title and extracted text. */
export async function fetchWebPage(
  url: string,
  options: FetchWebTextOptions = {},
): Promise<{ title: string | null; text: string }> {
  const { body } = await fetchGuarded(url, options);
  return { title: extractTitle(body), text: htmlToText(body) };
}

function metaContent(html: string, key: string): string | null {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = tag.match(/\b(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name !== key) continue;
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1];
    if (content) return decodeEntities(content).trim() || null;
  }
  return null;
}

/**
 * What identifies a site at a glance: its name and a preview image, read from
 * the page itself (`og:image`/`twitter:image`). No screenshot service: that
 * would send the address to a third party or need a headless browser
 * (`CLAUDE.md` §2). The image is only ever shown in an `<img>`, so only an
 * http(s) address is kept.
 */
export function extractPageMeta(html: string, baseUrl: string): { title: string | null; imageUrl: string | null } {
  const title = metaContent(html, "og:site_name") ?? extractTitle(html);
  const image = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");
  let imageUrl: string | null = null;
  if (image) {
    try {
      const resolved = new URL(image, baseUrl);
      imageUrl = resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.href : null;
    } catch {
      imageUrl = null;
    }
  }
  return { title, imageUrl };
}
