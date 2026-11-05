import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { organizations } from "@/modules/organizations/schema";
import { users } from "@/modules/auth/schema";
import { documents, knowledgeChunks, knowledgeWebsitePages, knowledgeWebsites } from "@/modules/knowledge/schema";
import {
  addWebsite,
  addWebsitePage,
  defaultWebsiteOptions,
  deleteWebsite,
  getWebsite,
  listWebsites,
  processWebsitePages,
  queueWebsitePages,
  refreshWebsitePages,
  reindexWebsiteDocuments,
  retryFailedWebsitePages,
  updateWebsiteOptions,
} from "@/modules/knowledge/websites";
import { UploadError, uploadKnowledgeDocument } from "@/modules/knowledge/upload";
import { MAX_IMPORT_PAGES } from "@/modules/knowledge/source-status";
import { clearEmbeddingProvider, registerEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";

/** Integration tests for websites as knowledge sources. No network: a fake site and an injected page fetcher. */

let client: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<typeof schema>;
const provider = createFakeEmbeddingProvider();

beforeAll(async () => {
  client = postgres(process.env.DATABASE_URL!, { max: 1 });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle/migrations") });
  registerEmbeddingProvider(provider);
});

afterAll(async () => {
  clearEmbeddingProvider();
  await client.end();
});

async function setup() {
  const [org] = await db.insert(organizations).values({ name: `org-web-${randomUUID()}` }).returning();
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name: "Admin", email: `${randomUUID()}@example.com`, emailVerified: true })
    .returning();
  return { org, user };
}

const publicHost = async () => ["93.184.216.34"];

/** A fake network: path → body (or a Response). Anything else is a 404. */
function fakeSite(files: Record<string, string>) {
  const fetchImpl = (async (input: URL | string) => {
    const body = files[new URL(String(input)).pathname];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, resolveHost: publicHost };
}

const HOME = `<html><head><title>Inicio</title>
  <meta property="og:site_name" content="Ejemplo S.L.">
  <meta property="og:image" content="/portada.png"></head><body>Portada</body></html>`;
const sitemapFor = (host: string, ...paths: string[]) =>
  `<urlset>${paths.map((p, i) => `<url><loc>https://${host}${p}</loc><lastmod>2024-0${i + 1}-01</lastmod></url>`).join("")}</urlset>`;
const sitemap = (...paths: string[]) => sitemapFor("example.org", ...paths);

const fetcher = (broken: string[] = []) =>
  (async (url: string) => {
    if (broken.includes(url)) throw new Error("boom");
    return { title: `Título de ${new URL(url).pathname}`, text: `Contenido único de ${url}. Párrafo con texto suficiente.` };
  }) as never;
const fast = { pauseMs: 0 };

async function website(org: { id: string }, user: { id: string }, pages = ["/a", "/b", "/c"], host = "example.org") {
  const net = fakeSite({ "/": HOME, "/sitemap.xml": sitemapFor(host, ...pages) });
  const { websiteId } = await addWebsite({ organizationId: org.id, actorUserId: user.id, url: `https://${host}/`, fetchOptions: net });
  return websiteId;
}

describe("addWebsite", () => {
  it("stores the site with its name, preview image, discovered pages and default publication data", async () => {
    const { org, user } = await setup();
    const id = await website(org, user);
    const found = (await getWebsite(org.id, id))!;

    expect(found.website).toMatchObject({
      url: "https://example.org/",
      title: "Ejemplo S.L.",
      imageUrl: "https://example.org/portada.png",
      discoverySource: "sitemap",
      createdBy: user.id,
    });
    expect(found.website.options).toMatchObject({ status: "CURRENT", version: found.website.options.effectiveFrom });
    expect(found.pages.map((p) => p.url).sort()).toEqual(["https://example.org/a", "https://example.org/b", "https://example.org/c"]);
    expect(found.pages.every((p) => p.status === "DISCOVERED")).toBe(true);
  });

  it("returns the existing site for the same address instead of duplicating it", async () => {
    const { org, user } = await setup();
    const first = await website(org, user);
    const net = fakeSite({ "/": HOME, "/sitemap.xml": sitemap("/a") });
    const again = await addWebsite({ organizationId: org.id, actorUserId: user.id, url: "https://example.org/#x", fetchOptions: net });
    expect(again).toEqual({ websiteId: first, created: false });
    expect(await listWebsites(org.id)).toHaveLength(1);
  });

  it("marks pages the organization already has as documents as indexed, linked to that document", async () => {
    const { org, user } = await setup();
    const existing = await uploadKnowledgeDocument({
      organizationId: org.id,
      actorUserId: user.id,
      document: { title: "Ya la tengo", jurisdiction: null, territory: null, scope: null },
      fields: { ...defaultWebsiteOptions("https://example.org/"), origin: "WEB", file: null, url: "https://example.org/a" },
      source: { type: "WEB", url: "https://example.org/a", text: "Texto de la página que ya existe." },
    });
    const id = await website(org, user);
    const page = (await getWebsite(org.id, id))!.pages.find((p) => p.url === "https://example.org/a")!;
    expect(page).toMatchObject({ status: "INDEXED", documentId: existing.id });
  });

  it("offers the address itself when the site has neither sitemap nor feed", async () => {
    const { org, user } = await setup();
    const net = fakeSite({ "/": HOME });
    const { websiteId } = await addWebsite({ organizationId: org.id, actorUserId: user.id, url: "https://example.org/", fetchOptions: net });
    const found = (await getWebsite(org.id, websiteId))!;
    expect(found.website.discoverySource).toBe("none");
    expect(found.pages.map((p) => p.url)).toEqual(["https://example.org/"]);
  });

  it("refuses an unreachable site, a private address and an invalid address, creating nothing", async () => {
    const { org, user } = await setup();
    const input = { organizationId: org.id, actorUserId: user.id };
    await expect(addWebsite({ ...input, url: "https://example.org/", fetchOptions: fakeSite({}) })).rejects.toThrow(/No se pudo acceder/);
    await expect(
      addWebsite({ ...input, url: "https://example.org/", fetchOptions: { ...fakeSite({ "/": HOME }), resolveHost: async () => ["10.0.0.5"] } }),
    ).rejects.toThrow(UploadError);
    await expect(addWebsite({ ...input, url: "no es una url" })).rejects.toThrow(UploadError);
    expect(await listWebsites(org.id)).toEqual([]);
  });
});

describe("queue and index pages", () => {
  it("indexes only the chosen pages, as ORGANIZATION documents with the website's publication data", async () => {
    const { org, user } = await setup();
    const id = await website(org, user);
    await updateWebsiteOptions(org.id, id, { ...defaultWebsiteOptions("https://example.org/"), version: "v7", jurisdiction: "ES" });

    expect(await queueWebsitePages(org.id, id, ["https://example.org/a", "https://example.org/b"])).toBe(2);
    expect(await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher() })).toEqual({ processed: 2, remaining: 0 });

    const pages = (await getWebsite(org.id, id))!.pages;
    expect(pages.filter((p) => p.status === "INDEXED")).toHaveLength(2);
    expect(pages.find((p) => p.url.endsWith("/c"))!.status).toBe("DISCOVERED");

    const done = pages.find((p) => p.url.endsWith("/a"))!;
    const [doc] = await db.select().from(documents).where(eq(documents.id, done.documentId!));
    expect(doc).toMatchObject({
      organizationId: org.id,
      visibility: "ORGANIZATION",
      sourceType: "WEB",
      sourceUrl: "https://example.org/a",
      title: "Título de /a",
      jurisdiction: "ES",
    });
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc.id));
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("does not queue an already indexed or in-progress page, and caps one request", async () => {
    const { org, user } = await setup();
    const id = await website(org, user);
    await queueWebsitePages(org.id, id, ["https://example.org/a"]);
    await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher() });

    expect(await queueWebsitePages(org.id, id, ["https://example.org/a", "https://example.org/b"])).toBe(1);
    await expect(queueWebsitePages(org.id, id, [])).rejects.toThrow(UploadError);
    const many = Array.from({ length: MAX_IMPORT_PAGES + 1 }, (_, i) => `https://example.org/p${i}`);
    await expect(queueWebsitePages(org.id, id, many)).rejects.toThrow(/como máximo/);
  });

  it("marks a failing page FAILED with a user-facing message, carries on, and retries it", async () => {
    const { org, user } = await setup();
    const id = await website(org, user, ["/rota", "/buena"]);
    await queueWebsitePages(org.id, id, ["https://example.org/rota", "https://example.org/buena"]);

    await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher(["https://example.org/rota"]) });
    const rows = (await getWebsite(org.id, id))!.pages;
    const broken = rows.find((r) => r.url.endsWith("/rota"))!;
    expect(broken.status).toBe("FAILED");
    expect(broken.error).toMatch(/No se pudo descargar la página/);
    expect(broken.error).not.toMatch(/boom/);
    expect(rows.find((r) => r.url.endsWith("/buena"))!.status).toBe("INDEXED");

    expect(await retryFailedWebsitePages(org.id, id)).toBe(1);
    await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher() });
    expect((await getWebsite(org.id, id))!.pages.every((r) => r.status === "INDEXED")).toBe(true);
  });

  it("stops after its time budget and leaves the rest PENDING for the next slice", async () => {
    const { org, user } = await setup();
    const id = await website(org, user);
    await queueWebsitePages(org.id, id, ["https://example.org/a", "https://example.org/b", "https://example.org/c"]);
    expect(await processWebsitePages(org.id, id, { pauseMs: 0, budgetMs: 0, fetchPage: fetcher() })).toEqual({ processed: 0, remaining: 3 });
    expect(await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher() })).toEqual({ processed: 3, remaining: 0 });
  });

  it("takes over a page left INDEXING by a crashed slice, but not a fresh claim", async () => {
    const { org, user } = await setup();
    const id = await website(org, user, ["/colgada"]);
    await queueWebsitePages(org.id, id, ["https://example.org/colgada"]);
    const [row] = (await getWebsite(org.id, id))!.pages;

    await db.update(knowledgeWebsitePages).set({ status: "INDEXING", startedAt: new Date() }).where(eq(knowledgeWebsitePages.id, row.id));
    expect(await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher() })).toEqual({ processed: 0, remaining: 1 });

    await db
      .update(knowledgeWebsitePages)
      .set({ startedAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(eq(knowledgeWebsitePages.id, row.id));
    expect(await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher() })).toEqual({ processed: 1, remaining: 0 });
  });

  it("refuses to run without an embedding provider", async () => {
    const { org } = await setup();
    clearEmbeddingProvider();
    try {
      await expect(processWebsitePages(org.id, randomUUID(), fast)).rejects.toThrow(/embeddings/);
    } finally {
      registerEmbeddingProvider(provider);
    }
  });
});

describe("pages of a website", () => {
  it("refresh adds only the pages not known yet", async () => {
    const { org, user } = await setup();
    const id = await website(org, user, ["/a", "/b"]);
    const grown = fakeSite({ "/": HOME, "/sitemap.xml": sitemap("/a", "/b", "/nueva") });
    expect(await refreshWebsitePages(org.id, id, grown)).toEqual({ added: 1 });
    expect(await refreshWebsitePages(org.id, id, grown)).toEqual({ added: 0 });
    expect((await getWebsite(org.id, id))!.pages).toHaveLength(3);
  });

  it("adds a page by address only if it belongs to the site and is not listed yet", async () => {
    const { org, user } = await setup();
    const id = await website(org, user, ["/a"]);
    await addWebsitePage(org.id, id, "https://www.example.org/manual/");
    expect((await getWebsite(org.id, id))!.pages.map((p) => p.url)).toContain("https://www.example.org/manual");
    await expect(addWebsitePage(org.id, id, "https://example.org/a")).rejects.toThrow(/ya está en la lista/);
    await expect(addWebsitePage(org.id, id, "https://otro.org/x")).rejects.toThrow(/mismo sitio/);
    await expect(addWebsitePage(org.id, id, "https://example.org/logo.png")).rejects.toThrow(UploadError);
  });

  it("lists websites with how many pages are in each state", async () => {
    const { org, user } = await setup();
    const id = await website(org, user, ["/a", "/b", "/c"]);
    await queueWebsitePages(org.id, id, ["https://example.org/a", "https://example.org/b"]);
    await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher(["https://example.org/b"]) });
    await queueWebsitePages(org.id, id, ["https://example.org/c"]);

    const [row] = await listWebsites(org.id);
    expect(row).toMatchObject({ id, total: 3, indexed: 1, failed: 1, open: 1 });
  });
});

describe("reindex and delete", () => {
  it("reindexes the website's documents that were embedded by another model", async () => {
    const { org, user } = await setup();
    const id = await website(org, user, ["/a"]);
    await queueWebsitePages(org.id, id, ["https://example.org/a"]);
    await processWebsitePages(org.id, id, { ...fast, fetchPage: fetcher() });
    const [page] = (await getWebsite(org.id, id))!.pages;
    await db.update(knowledgeChunks).set({ embeddingModel: "legacy" }).where(eq(knowledgeChunks.documentId, page.documentId!));

    const result = await reindexWebsiteDocuments(org.id, id);
    expect(result.documents).toBe(1);
    expect(result.reembedded).toBeGreaterThan(0);
    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.documentId, page.documentId!));
    expect(chunks.every((c) => c.embeddingModel === provider.id)).toBe(true);
  });

  it("deletes the website keeping its documents, or deleting them when asked", async () => {
    const { org, user } = await setup();
    const keep = await website(org, user, ["/a"], "example.org");
    const drop = await website(org, user, ["/a"], "sample.com");
    await queueWebsitePages(org.id, keep, ["https://example.org/a"]);
    await queueWebsitePages(org.id, drop, ["https://sample.com/a"]);
    await processWebsitePages(org.id, keep, { ...fast, fetchPage: fetcher() });
    await processWebsitePages(org.id, drop, { ...fast, fetchPage: fetcher() });
    const keptDoc = (await getWebsite(org.id, keep))!.pages[0].documentId!;
    const droppedDoc = (await getWebsite(org.id, drop))!.pages[0].documentId!;

    expect(await deleteWebsite(org.id, keep, { deleteDocuments: false })).toEqual({ deletedDocuments: 0 });
    expect(await getWebsite(org.id, keep)).toBeNull();
    expect(await db.select().from(documents).where(eq(documents.id, keptDoc))).toHaveLength(1);

    expect(await deleteWebsite(org.id, drop, { deleteDocuments: true })).toEqual({ deletedDocuments: 1 });
    expect(await db.select().from(documents).where(eq(documents.id, droppedDoc))).toHaveLength(0);
    expect(await db.select().from(knowledgeWebsitePages).where(eq(knowledgeWebsitePages.websiteId, drop))).toHaveLength(0);
  });

  it("never touches another organization's website", async () => {
    const a = await setup();
    const b = await setup();
    const id = await website(a.org, a.user);
    await queueWebsitePages(a.org.id, id, ["https://example.org/a"]);

    expect(await getWebsite(b.org.id, id)).toBeNull();
    expect(await listWebsites(b.org.id)).toEqual([]);
    expect(await processWebsitePages(b.org.id, id, { ...fast, fetchPage: fetcher() })).toEqual({ processed: 0, remaining: 0 });
    await expect(queueWebsitePages(b.org.id, id, ["https://example.org/b"])).rejects.toThrow(/no encontrado/);
    await expect(refreshWebsitePages(b.org.id, id)).rejects.toThrow(/no encontrado/);
    await expect(addWebsitePage(b.org.id, id, "https://example.org/z")).rejects.toThrow(/no encontrado/);
    await expect(updateWebsiteOptions(b.org.id, id, defaultWebsiteOptions("https://example.org/"))).rejects.toThrow(/no encontrado/);
    await expect(deleteWebsite(b.org.id, id, { deleteDocuments: true })).rejects.toThrow(/no encontrado/);
    expect(await retryFailedWebsitePages(b.org.id, id)).toBe(0);

    expect(await db.select().from(knowledgeWebsites).where(and(eq(knowledgeWebsites.id, id), eq(knowledgeWebsites.organizationId, a.org.id)))).toHaveLength(1);
    expect((await getWebsite(a.org.id, id))!.pages.find((p) => p.url.endsWith("/a"))!.status).toBe("PENDING");
  });
});
