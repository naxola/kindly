import { describe, expect, it } from "vitest";
import {
  discoverPages,
  findFeedLinks,
  isAllowedByRobots,
  isSitePage,
  MAX_DISCOVERED_PAGES,
  normalizePageUrl,
  parseFeed,
  parseRobotsTxt,
  parseSitemapXml,
} from "@/modules/knowledge/ingestion/site-discovery";

const publicHost = async () => ["93.184.216.34"];

/** A fake network: path → body. Anything else is a 404. */
function fakeSite(files: Record<string, string>) {
  const requested: string[] = [];
  const fetchImpl = (async (input: URL | string) => {
    const url = new URL(String(input));
    requested.push(url.pathname);
    const body = files[url.pathname];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, requested };
}

const urlset = (...locs: string[]) =>
  `<?xml version="1.0"?><urlset>${locs.map((loc) => `<url><loc>${loc}</loc></url>`).join("")}</urlset>`;

describe("parseRobotsTxt / isAllowedByRobots", () => {
  it("reads sitemaps and only the Disallow rules of the * group", () => {
    const robots = parseRobotsTxt(`
      User-agent: Googlebot
      Disallow: /solo-google
      User-agent: *
      Disallow: /privado # comentario
      Disallow:
      Sitemap: https://example.org/sitemap.xml
    `);
    expect(robots.sitemaps).toEqual(["https://example.org/sitemap.xml"]);
    expect(robots.disallow).toEqual(["/privado"]);
  });

  it("merges consecutive User-agent lines into one group", () => {
    const robots = parseRobotsTxt("User-agent: bot\nUser-agent: *\nDisallow: /x");
    expect(robots.disallow).toEqual(["/x"]);
  });

  it("matches prefixes, wildcards and end anchors", () => {
    expect(isAllowedByRobots("/privado/a", ["/privado"])).toBe(false);
    expect(isAllowedByRobots("/publico", ["/privado"])).toBe(true);
    expect(isAllowedByRobots("/a/borrador-1/x", ["/a/*/x"])).toBe(false);
    expect(isAllowedByRobots("/doc.pdf", ["/*.pdf$"])).toBe(false);
    expect(isAllowedByRobots("/doc.pdf?x=1", ["/*.pdf$"])).toBe(true);
    expect(isAllowedByRobots("/cualquiera", [])).toBe(true);
  });
});

describe("parseSitemapXml", () => {
  it("reads urls with lastmod and decodes entities", () => {
    const parsed = parseSitemapXml(
      "<urlset><url><loc>https://e.org/a?x=1&amp;y=2</loc><lastmod>2024-05-01</lastmod></url><url><loc>https://e.org/b</loc></url></urlset>",
    );
    expect(parsed.pages).toEqual([
      { url: "https://e.org/a?x=1&y=2", lastModified: "2024-05-01" },
      { url: "https://e.org/b", lastModified: null },
    ]);
  });

  it("reads a sitemap index as child sitemaps, not pages", () => {
    const parsed = parseSitemapXml(
      "<sitemapindex><sitemap><loc>https://e.org/s1.xml</loc></sitemap><sitemap><loc>https://e.org/s2.xml</loc></sitemap></sitemapindex>",
    );
    expect(parsed.pages).toEqual([]);
    expect(parsed.childSitemaps).toEqual(["https://e.org/s1.xml", "https://e.org/s2.xml"]);
  });
});

describe("parseFeed / findFeedLinks", () => {
  it("reads RSS items with title and date, including CDATA", () => {
    const pages = parseFeed(
      "<rss><channel><item><title><![CDATA[Novedades 2024]]></title><link>https://e.org/n</link><pubDate>Tue, 02 Jan 2024</pubDate></item></channel></rss>",
    );
    expect(pages).toEqual([{ url: "https://e.org/n", title: "Novedades 2024", lastModified: "Tue, 02 Jan 2024" }]);
  });

  it("reads Atom entries, preferring the alternate link", () => {
    const pages = parseFeed(
      `<feed><entry><title>Guía</title><link rel="self" href="https://e.org/self"/><link rel="alternate" href="https://e.org/guia"/><updated>2024-03-01</updated></entry></feed>`,
    );
    expect(pages).toEqual([{ url: "https://e.org/guia", title: "Guía", lastModified: "2024-03-01" }]);
  });

  it("finds announced feeds and resolves relative hrefs", () => {
    const html = `<head><link rel="alternate" type="application/rss+xml" href="/blog/feed.xml"><link rel="stylesheet" href="/a.css"></head>`;
    expect(findFeedLinks(html, "https://e.org/blog")).toEqual(["https://e.org/blog/feed.xml"]);
  });
});

describe("page filters", () => {
  const site = new URL("https://www.example.org/");

  it("accepts the same host (with or without www) and rejects other hosts and assets", () => {
    expect(isSitePage("https://example.org/a", site)).toBe(true);
    expect(isSitePage("https://otro.org/a", site)).toBe(false);
    expect(isSitePage("https://example.org/logo.png", site)).toBe(false);
    expect(isSitePage("ftp://example.org/a", site)).toBe(false);
    expect(isSitePage("no es una url", site)).toBe(false);
  });

  it("normalizes fragments and trailing slashes", () => {
    expect(normalizePageUrl("https://e.org/a/#top")).toBe("https://e.org/a");
    expect(normalizePageUrl("https://e.org/")).toBe("https://e.org/");
  });
});

describe("discoverPages", () => {
  it("lists a sitemap's pages from this site only, newest first, deduplicated", async () => {
    const { fetchImpl } = fakeSite({
      "/robots.txt": "User-agent: *\nDisallow: /privado\nSitemap: https://example.org/sitemap.xml",
      "/sitemap.xml": `<urlset>
        <url><loc>https://example.org/a</loc><lastmod>2024-01-01</lastmod></url>
        <url><loc>https://example.org/b/</loc><lastmod>2024-06-01</lastmod></url>
        <url><loc>https://example.org/b</loc></url>
        <url><loc>https://example.org/privado/x</loc></url>
        <url><loc>https://otro.org/c</loc></url>
        <url><loc>https://example.org/foto.jpg</loc></url>
      </urlset>`,
    });
    const result = await discoverPages("https://example.org/", { fetchImpl, resolveHost: publicHost });
    expect(result.source).toBe("sitemap");
    expect(result.pages.map((p) => p.url)).toEqual(["https://example.org/b", "https://example.org/a"]);
    expect(result.truncated).toBe(false);
  });

  it("follows one level of sitemap index", async () => {
    const { fetchImpl } = fakeSite({
      "/sitemap.xml": "<sitemapindex><sitemap><loc>https://example.org/posts.xml</loc></sitemap></sitemapindex>",
      "/posts.xml": urlset("https://example.org/p1", "https://example.org/p2"),
    });
    const result = await discoverPages("https://example.org/", { fetchImpl, resolveHost: publicHost });
    expect(result.pages.map((p) => p.url).sort()).toEqual(["https://example.org/p1", "https://example.org/p2"]);
  });

  it("restricts to the section when the address is not the site root", async () => {
    const { fetchImpl } = fakeSite({
      "/sitemap.xml": urlset("https://example.org/blog/a", "https://example.org/blog", "https://example.org/blogger/x", "https://example.org/otra"),
    });
    const result = await discoverPages("https://example.org/blog/", { fetchImpl, resolveHost: publicHost });
    expect(result.pages.map((p) => p.url).sort()).toEqual(["https://example.org/blog", "https://example.org/blog/a"]);
  });

  it("falls back to the feed announced by the page, with titles", async () => {
    const { fetchImpl } = fakeSite({
      "/": `<link rel="alternate" type="application/rss+xml" href="/rss-especial">`,
      "/rss-especial": "<rss><item><title>Nota</title><link>https://example.org/nota</link></item></rss>",
    });
    const result = await discoverPages("https://example.org/", { fetchImpl, resolveHost: publicHost });
    expect(result.source).toBe("feed");
    expect(result.pages).toEqual([{ url: "https://example.org/nota", title: "Nota", lastModified: null }]);
  });

  it("reports none when there is neither sitemap nor feed", async () => {
    const { fetchImpl } = fakeSite({});
    const result = await discoverPages("https://example.org/", { fetchImpl, resolveHost: publicHost });
    expect(result).toEqual({ pages: [], source: "none", truncated: false });
  });

  it("caps the list and says it was truncated", async () => {
    const locs = Array.from({ length: MAX_DISCOVERED_PAGES + 5 }, (_, i) => `https://example.org/p${i}`);
    const { fetchImpl } = fakeSite({ "/sitemap.xml": urlset(...locs) });
    const result = await discoverPages("https://example.org/", { fetchImpl, resolveHost: publicHost });
    expect(result.pages).toHaveLength(MAX_DISCOVERED_PAGES);
    expect(result.truncated).toBe(true);
  });

  it("never fetches a host that resolves to a private address", async () => {
    const { fetchImpl, requested } = fakeSite({ "/sitemap.xml": urlset("https://example.org/a") });
    const result = await discoverPages("https://example.org/", { fetchImpl, resolveHost: async () => ["10.0.0.5"] });
    expect(result.pages).toEqual([]);
    expect(requested).toEqual([]);
  });
});
