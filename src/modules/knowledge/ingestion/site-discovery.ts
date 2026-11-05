/**
 * Discovers the pages of a website an ADMIN may want to index (knowledge
 * step 2). Two honest sources, no crawling: the site's `sitemap.xml`
 * (announced in `robots.txt` or at the default path, one level of sitemap
 * index) and its RSS/Atom feed. Following arbitrary links is deliberately
 * out of scope: it mixes menus, footers and external pages, and a crawler is
 * infrastructure we do not need (`CLAUDE.md` §2).
 *
 * Only the pure parsers hold logic; `discoverPages` composes them over
 * `fetchGuarded` (SSRF guard on every request), with `fetchImpl` and
 * `resolveHost` injectable so tests never touch the network. `robots.txt`
 * `Disallow` rules for `*` are respected. Regex parsing, no XML library, for
 * the same reason as `extract-web.ts`.
 */
import { fetchGuarded, type FetchWebTextOptions } from "@/modules/knowledge/ingestion/extract-web";

export interface DiscoveredPage {
  url: string;
  /** Known only from a feed; sitemaps carry none (the real title is read when the page is indexed). */
  title: string | null;
  lastModified: string | null;
}

export type DiscoverySource = "sitemap" | "feed" | "none";

export interface DiscoveryResult {
  pages: DiscoveredPage[];
  source: DiscoverySource;
  /** More pages exist than `MAX_DISCOVERED_PAGES`. */
  truncated: boolean;
}

export const MAX_DISCOVERED_PAGES = 200;
const MAX_SITEMAP_FILES = 6;
const MAX_XML_BYTES = 2 * 1024 * 1024;
const DEFAULT_FEED_PATHS = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml"];

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagText(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  return decodeXml(match[1]) || null;
}

function blocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => m[1]);
}

export function parseRobotsTxt(text: string): { sitemaps: string[]; disallow: string[] } {
  const sitemaps: string[] = [];
  const disallow: string[] = [];
  let agents: string[] = [];
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "sitemap" && value) {
      sitemaps.push(value);
    } else if (field === "user-agent") {
      agents = lastWasAgent ? [...agents, value.toLowerCase()] : [value.toLowerCase()];
      lastWasAgent = true;
      continue;
    } else if (field === "disallow" && value && agents.includes("*")) {
      disallow.push(value);
    }
    lastWasAgent = false;
  }
  return { sitemaps, disallow };
}

/** `Disallow` prefix match with the `*` and `$` extensions. */
export function isAllowedByRobots(pathAndQuery: string, disallow: string[]): boolean {
  return !disallow.some((rule) => {
    const anchored = rule.endsWith("$");
    const pattern = (anchored ? rule.slice(0, -1) : rule)
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(pathAndQuery);
  });
}

export function parseSitemapXml(xml: string): { pages: { url: string; lastModified: string | null }[]; childSitemaps: string[] } {
  if (/<sitemapindex\b/i.test(xml)) {
    return {
      pages: [],
      childSitemaps: blocks(xml, "sitemap").flatMap((block) => tagText(block, "loc") ?? []),
    };
  }
  return {
    pages: blocks(xml, "url").flatMap((block) => {
      const loc = tagText(block, "loc");
      return loc ? [{ url: loc, lastModified: tagText(block, "lastmod") }] : [];
    }),
    childSitemaps: [],
  };
}

export function parseFeed(xml: string): DiscoveredPage[] {
  const rss = blocks(xml, "item").flatMap((item) => {
    const link = tagText(item, "link");
    return link ? [{ url: link, title: tagText(item, "title"), lastModified: tagText(item, "pubDate") }] : [];
  });
  if (rss.length > 0) return rss;
  return blocks(xml, "entry").flatMap((entry) => {
    const links = [...entry.matchAll(/<link\b([^>]*)>/gi)].map((m) => m[1]);
    const alternate = links.find((attrs) => !/rel=["'](?!alternate)/i.test(attrs)) ?? links[0];
    const href = alternate?.match(/href=["']([^"']+)["']/i)?.[1];
    return href
      ? [{ url: decodeXml(href), title: tagText(entry, "title"), lastModified: tagText(entry, "updated") ?? tagText(entry, "published") }]
      : [];
  });
}

/** Feed addresses a page announces with `<link rel="alternate" type="application/rss+xml">`. */
export function findFeedLinks(html: string, base: string): string[] {
  const urls: string[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel=["']alternate["']/i.test(tag) || !/type=["']application\/(rss|atom)\+xml["']/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      urls.push(new URL(decodeXml(href), base).href);
    } catch {
      // not a URL: ignore
    }
  }
  return urls;
}

const NON_PAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|ico|css|js|json|xml|txt|zip|gz|mp3|mp4|webm|woff2?|ttf|pdf)$/i;

const withoutWww = (hostname: string) => hostname.replace(/^www\./i, "").toLowerCase();

/** http(s) and the same host as the site (ignoring `www.`). */
export function isSameSite(candidate: string, site: URL): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  return (url.protocol === "http:" || url.protocol === "https:") && withoutWww(url.hostname) === withoutWww(site.hostname);
}

/** Same site, and something that looks like a page rather than an asset. */
export function isSitePage(candidate: string, site: URL): boolean {
  return isSameSite(candidate, site) && !NON_PAGE_EXTENSIONS.test(new URL(candidate).pathname);
}

/** Drops the fragment and a trailing slash so `/a`, `/a/` and `/a#x` count once. */
export function normalizePageUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.href;
}

async function tryFetch(url: string, options: FetchWebTextOptions): Promise<string | null> {
  try {
    return (await fetchGuarded(url, { ...options, maxBytes: MAX_XML_BYTES })).body;
  } catch {
    return null;
  }
}

export async function discoverPages(siteUrl: string, options: FetchWebTextOptions = {}): Promise<DiscoveryResult> {
  const site = new URL(siteUrl);
  const robotsText = await tryFetch(new URL("/robots.txt", site).href, options);
  const robots = robotsText ? parseRobotsTxt(robotsText) : { sitemaps: [], disallow: [] };

  const section = site.pathname === "/" ? "" : site.pathname.replace(/\/$/, "");
  const collect = (candidates: DiscoveredPage[]) => {
    const seen = new Set<string>();
    const pages: DiscoveredPage[] = [];
    for (const candidate of candidates) {
      if (!isSitePage(candidate.url, site)) continue;
      const url = normalizePageUrl(candidate.url);
      const parsed = new URL(url);
      if (section && !(parsed.pathname === section || parsed.pathname.startsWith(`${section}/`))) continue;
      if (!isAllowedByRobots(parsed.pathname + parsed.search, robots.disallow)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      pages.push({ ...candidate, url });
    }
    return pages;
  };

  const finish = (all: DiscoveredPage[], source: DiscoverySource): DiscoveryResult => {
    const ordered = [...all].sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? "") || a.url.localeCompare(b.url));
    return { pages: ordered.slice(0, MAX_DISCOVERED_PAGES), source, truncated: ordered.length > MAX_DISCOVERED_PAGES };
  };

  // 1. Sitemap (and one level of sitemap index).
  const sitemapQueue = (robots.sitemaps.length > 0 ? robots.sitemaps : [new URL("/sitemap.xml", site).href]).filter(
    (url) => isSameSite(url, site) && !/\.gz$/i.test(url),
  );
  const fromSitemaps: DiscoveredPage[] = [];
  const visited = new Set<string>();
  for (let i = 0; i < sitemapQueue.length && visited.size < MAX_SITEMAP_FILES; i++) {
    const url = sitemapQueue[i];
    if (visited.has(url)) continue;
    visited.add(url);
    const xml = await tryFetch(url, options);
    if (!xml) continue;
    const parsed = parseSitemapXml(xml);
    fromSitemaps.push(...parsed.pages.map((page) => ({ ...page, title: null })));
    sitemapQueue.push(...parsed.childSitemaps.filter((child) => isSameSite(child, site) && !/\.gz$/i.test(child)));
  }
  const sitemapPages = collect(fromSitemaps);
  if (sitemapPages.length > 0) return finish(sitemapPages, "sitemap");

  // 2. Feed announced by the page itself, then the usual paths.
  const html = await tryFetch(site.href, options);
  const feedUrls = [...(html ? findFeedLinks(html, site.href) : []), ...DEFAULT_FEED_PATHS.map((path) => new URL(path, site).href)];
  for (const feedUrl of [...new Set(feedUrls)].slice(0, 8)) {
    const xml = await tryFetch(feedUrl, options);
    if (!xml) continue;
    const feedPages = collect(parseFeed(xml));
    if (feedPages.length > 0) return finish(feedPages, "feed");
  }

  return { pages: [], source: "none", truncated: false };
}
