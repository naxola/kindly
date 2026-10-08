/**
 * Websites as knowledge sources (knowledge step 2, redesigned): an ADMIN adds
 * a site; its pages are discovered once (`ingestion/site-discovery.ts`) and
 * kept as rows of `knowledge_website_pages`; the ADMIN picks which to index
 * and each becomes a normal ORGANIZATION document through
 * `uploadKnowledgeDocument`.
 *
 * Background work without a queue (`CLAUDE.md` §2): `processWebsitePages`
 * indexes pages in time-boxed slices. A page is *claimed* with one atomic
 * `UPDATE … FOR UPDATE SKIP LOCKED`, so two slices running at once never take
 * the same page, and a page left INDEXING by a crashed slice is taken over
 * after a lease. The first slice runs from `after()` in the action that
 * queues the pages; the open website panel keeps calling more slices while
 * pages remain, so a long import survives a function timeout.
 *
 * Everything is scoped by `organization_id` on every query: a website id from
 * another organization behaves as if it did not exist.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  documents,
  knowledgeWebsitePages,
  knowledgeWebsites,
  type WebsiteDiscoverySource,
  type WebsiteOptions,
} from "@/modules/knowledge/schema";
import { hasEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import {
  extractPageMeta,
  fetchGuarded,
  fetchWebPage,
  type FetchWebTextOptions,
} from "@/modules/knowledge/ingestion/extract-web";
import { discoverPages, isSameSite, isSitePage, normalizePageUrl } from "@/modules/knowledge/ingestion/site-discovery";
import { validateWebUrl } from "@/modules/knowledge/ingestion/upload-validation";
import { reindexKnowledgeChunks } from "@/modules/knowledge/reindex";
import { MAX_IMPORT_PAGES } from "@/modules/knowledge/source-status";
import { UploadError, uploadKnowledgeDocument } from "@/modules/knowledge/upload";

const CLAIM_LEASE_MINUTES = 3;
const DEFAULT_BUDGET_MS = 40_000;
const DEFAULT_PAUSE_MS = 250;

/** Publication data a new website starts with: today's date as version and start of validity, editable afterwards. */
export function defaultWebsiteOptions(url: string, today: Date = new Date()): WebsiteOptions {
  const day = today.toISOString().slice(0, 10);
  const [year, month, date] = day.split("-");
  return {
    version: day,
    status: "CURRENT",
    effectiveFrom: day,
    effectiveUntil: null,
    sourceNote: `Sitio web ${new URL(url).host}, consultado el ${date}/${month}/${year}`,
    jurisdiction: null,
    territory: null,
    scope: null,
  };
}

/** Normalized `source_url` → document id of the organization's own web documents. */
export async function existingSourceUrls(organizationId: string): Promise<Map<string, string>> {
  const existing = await db
    .select({ id: documents.id, sourceUrl: documents.sourceUrl })
    .from(documents)
    .where(and(eq(documents.organizationId, organizationId), isNotNull(documents.sourceUrl)));
  return new Map(
    existing.flatMap((doc) => {
      try {
        return doc.sourceUrl ? [[normalizePageUrl(doc.sourceUrl), doc.id] as const] : [];
      } catch {
        return [];
      }
    }),
  );
}

type NewPage = { url: string; title: string | null; lastModified: string | null };

function pageRows(
  organizationId: string,
  websiteId: string,
  pages: NewPage[],
  known: Map<string, string>,
) {
  return pages.map((page) => {
    const documentId = known.get(page.url) ?? null;
    return {
      organizationId,
      websiteId,
      url: page.url,
      title: page.title,
      lastModified: page.lastModified,
      // A page the organization already has as a document counts as indexed.
      status: documentId ? ("INDEXED" as const) : ("DISCOVERED" as const),
      documentId,
    };
  });
}

export interface AddWebsiteInput {
  organizationId: string;
  actorUserId: string;
  url: string;
  now?: Date;
  /** Injectable for tests — never a real network call in CI. */
  fetchOptions?: FetchWebTextOptions;
}

/** Adds a site (or returns the one the organization already has at that address). */
export async function addWebsite(input: AddWebsiteInput): Promise<{ websiteId: string; created: boolean }> {
  const valid = validateWebUrl(input.url);
  if (!valid.ok) throw new UploadError(valid.error);
  const url = normalizePageUrl(valid.value);

  const [existing] = await db
    .select({ id: knowledgeWebsites.id })
    .from(knowledgeWebsites)
    .where(and(eq(knowledgeWebsites.organizationId, input.organizationId), eq(knowledgeWebsites.url, url)))
    .limit(1);
  if (existing) return { websiteId: existing.id, created: false };

  let home: { body: string; finalUrl: string };
  try {
    home = await fetchGuarded(url, input.fetchOptions);
  } catch (error) {
    console.error("Website could not be read:", error instanceof Error ? error.message : "unknown error");
    throw new UploadError("No se pudo acceder al sitio. Comprueba que la dirección es pública y accesible.");
  }
  const meta = extractPageMeta(home.body, home.finalUrl);
  const discovery = await discoverPages(url, input.fetchOptions);
  // No sitemap or feed: offer at least the address itself, so a single page can still be indexed.
  const candidates: NewPage[] =
    discovery.pages.length > 0
      ? discovery.pages
      : [{ url, title: meta.title, lastModified: null }];

  const known = await existingSourceUrls(input.organizationId);
  const websiteId = await db.transaction(async (tx) => {
    const [website] = await tx
      .insert(knowledgeWebsites)
      .values({
        organizationId: input.organizationId,
        url,
        title: meta.title,
        imageUrl: meta.imageUrl,
        discoverySource: discovery.pages.length > 0 ? discovery.source : "none",
        discoveredAt: new Date(),
        options: defaultWebsiteOptions(url, input.now),
        createdBy: input.actorUserId,
      })
      .returning({ id: knowledgeWebsites.id });
    await tx
      .insert(knowledgeWebsitePages)
      .values(pageRows(input.organizationId, website.id, candidates, known))
      .onConflictDoNothing();
    return website.id;
  });
  return { websiteId, created: true };
}

export async function getWebsite(organizationId: string, websiteId: string) {
  const [website] = await db
    .select()
    .from(knowledgeWebsites)
    .where(and(eq(knowledgeWebsites.organizationId, organizationId), eq(knowledgeWebsites.id, websiteId)))
    .limit(1);
  if (!website) return null;
  const pages = await db
    .select()
    .from(knowledgeWebsitePages)
    .where(and(eq(knowledgeWebsitePages.organizationId, organizationId), eq(knowledgeWebsitePages.websiteId, websiteId)))
    .orderBy(desc(sql`coalesce(${knowledgeWebsitePages.lastModified}, '')`), asc(knowledgeWebsitePages.url));
  return { website, pages };
}

/** The organization's websites, newest first, with how many of their pages are in each state. */
export async function listWebsites(organizationId: string) {
  return db
    .select({
      id: knowledgeWebsites.id,
      url: knowledgeWebsites.url,
      title: knowledgeWebsites.title,
      imageUrl: knowledgeWebsites.imageUrl,
      createdAt: knowledgeWebsites.createdAt,
      total: sql<number>`count(${knowledgeWebsitePages.id})::int`,
      indexed: sql<number>`(count(*) filter (where ${knowledgeWebsitePages.status} = 'INDEXED'))::int`,
      failed: sql<number>`(count(*) filter (where ${knowledgeWebsitePages.status} = 'FAILED'))::int`,
      open: sql<number>`(count(*) filter (where ${knowledgeWebsitePages.status} in ('PENDING', 'INDEXING')))::int`,
    })
    .from(knowledgeWebsites)
    .leftJoin(knowledgeWebsitePages, eq(knowledgeWebsitePages.websiteId, knowledgeWebsites.id))
    .where(eq(knowledgeWebsites.organizationId, organizationId))
    .groupBy(knowledgeWebsites.id)
    .orderBy(desc(knowledgeWebsites.createdAt));
}

async function requireWebsite(organizationId: string, websiteId: string) {
  const found = await getWebsite(organizationId, websiteId);
  if (!found) throw new UploadError("Sitio web no encontrado.");
  return found;
}

/** Looks for pages again and adds the ones not known yet. Returns how many are new. */
export async function refreshWebsitePages(
  organizationId: string,
  websiteId: string,
  fetchOptions?: FetchWebTextOptions,
): Promise<{ added: number }> {
  const { website, pages } = await requireWebsite(organizationId, websiteId);
  const discovery = await discoverPages(website.url, fetchOptions);
  const knownUrls = new Set(pages.map((page) => page.url));
  const fresh = discovery.pages.filter((page) => !knownUrls.has(page.url));
  if (fresh.length > 0) {
    await db
      .insert(knowledgeWebsitePages)
      .values(pageRows(organizationId, websiteId, fresh, await existingSourceUrls(organizationId)))
      .onConflictDoNothing();
  }
  const source: WebsiteDiscoverySource = discovery.pages.length > 0 ? discovery.source : website.discoverySource;
  await db
    .update(knowledgeWebsites)
    .set({ discoveredAt: new Date(), discoverySource: source, updatedAt: new Date() })
    .where(and(eq(knowledgeWebsites.organizationId, organizationId), eq(knowledgeWebsites.id, websiteId)));
  return { added: fresh.length };
}

/** Adds one page of the site by address (for sites without a sitemap or feed). */
export async function addWebsitePage(organizationId: string, websiteId: string, rawUrl: string): Promise<void> {
  const { website } = await requireWebsite(organizationId, websiteId);
  const valid = validateWebUrl(rawUrl);
  if (!valid.ok) throw new UploadError(valid.error);
  if (!isSitePage(valid.value, new URL(website.url))) {
    throw new UploadError("La página debe ser del mismo sitio web.");
  }
  const url = normalizePageUrl(valid.value);
  const known = await existingSourceUrls(organizationId);
  const inserted = await db
    .insert(knowledgeWebsitePages)
    .values(pageRows(organizationId, websiteId, [{ url, title: null, lastModified: null }], known))
    .onConflictDoNothing()
    .returning({ id: knowledgeWebsitePages.id });
  if (inserted.length === 0) throw new UploadError("Esa página ya está en la lista.");
}

/** Puts the chosen pages (not yet indexed, or failed) in the queue. Returns how many were queued. */
export async function queueWebsitePages(organizationId: string, websiteId: string, urls: string[]): Promise<number> {
  await requireWebsite(organizationId, websiteId);
  const unique = [...new Set(urls)];
  if (unique.length === 0) throw new UploadError("Elige al menos una página.");
  if (unique.length > MAX_IMPORT_PAGES) {
    throw new UploadError(`Elige como máximo ${MAX_IMPORT_PAGES} páginas cada vez.`);
  }
  const rows = await db
    .update(knowledgeWebsitePages)
    .set({ status: "PENDING", error: null, startedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeWebsitePages.organizationId, organizationId),
        eq(knowledgeWebsitePages.websiteId, websiteId),
        inArray(knowledgeWebsitePages.url, unique),
        inArray(knowledgeWebsitePages.status, ["DISCOVERED", "FAILED"]),
      ),
    )
    .returning({ id: knowledgeWebsitePages.id });
  return rows.length;
}

/** FAILED pages go back to PENDING so the next slice retries them. */
export async function retryFailedWebsitePages(organizationId: string, websiteId: string): Promise<number> {
  const rows = await db
    .update(knowledgeWebsitePages)
    .set({ status: "PENDING", error: null, startedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeWebsitePages.organizationId, organizationId),
        eq(knowledgeWebsitePages.websiteId, websiteId),
        eq(knowledgeWebsitePages.status, "FAILED"),
      ),
    )
    .returning({ id: knowledgeWebsitePages.id });
  return rows.length;
}

type ClaimedPage = { id: string; url: string; title: string | null };

async function claimNextPage(organizationId: string, websiteId: string): Promise<ClaimedPage | null> {
  const rows = await db.execute<ClaimedPage>(sql`
    update knowledge_website_pages
    set status = 'INDEXING', started_at = now(), updated_at = now()
    where id = (
      select id from knowledge_website_pages
      where organization_id = ${organizationId}
        and website_id = ${websiteId}
        and (status = 'PENDING'
             or (status = 'INDEXING' and started_at < now() - make_interval(mins => ${CLAIM_LEASE_MINUTES})))
      order by created_at, id
      limit 1
      for update skip locked
    )
    returning id, url, title
  `);
  return rows[0] ?? null;
}

async function finishPage(
  id: string,
  result: { status: "INDEXED"; documentId: string; title: string } | { status: "FAILED"; error: string },
) {
  await db
    .update(knowledgeWebsitePages)
    .set(
      result.status === "INDEXED"
        ? { status: "INDEXED", documentId: result.documentId, title: result.title, error: null, updatedAt: new Date() }
        : { status: "FAILED", error: result.error, updatedAt: new Date() },
    )
    .where(eq(knowledgeWebsitePages.id, id));
}

function fallbackTitle(url: string): string {
  const { hostname, pathname } = new URL(url);
  const slug = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " ").trim();
  return slug || hostname;
}

export interface ProcessOptions {
  /** Who gets the audit trail of the documents created (the ADMIN driving the import). */
  actorUserId?: string | null;
  /** Stop starting new pages after this long (a Vercel function has a hard limit). */
  budgetMs?: number;
  pauseMs?: number;
  /** Injectable for tests — never a real network call in CI. */
  fetchPage?: typeof fetchWebPage;
}

/** Indexes queued pages of one website for up to `budgetMs`. Returns how many are still to do. */
export async function processWebsitePages(
  organizationId: string,
  websiteId: string,
  options: ProcessOptions = {},
): Promise<{ processed: number; remaining: number }> {
  if (!hasEmbeddingProvider()) {
    throw new UploadError("El servicio de embeddings no está configurado en este entorno.");
  }
  const found = await getWebsite(organizationId, websiteId);
  if (!found) return { processed: 0, remaining: 0 };
  const { website } = found;
  const site = new URL(website.url);
  const fetchPage = options.fetchPage ?? fetchWebPage;
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  let processed = 0;

  while (Date.now() < deadline) {
    const page = await claimNextPage(organizationId, websiteId);
    if (!page) break;
    if (processed > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.pauseMs ?? DEFAULT_PAUSE_MS));
    }
    processed += 1;

    try {
      if (!isSameSite(page.url, site)) {
        await finishPage(page.id, { status: "FAILED", error: "La página no pertenece al sitio web." });
        continue;
      }
      const fetched = await fetchPage(page.url);
      const title = fetched.title ?? page.title ?? fallbackTitle(page.url);
      const opts = website.options;
      const document = await uploadKnowledgeDocument({
        organizationId,
        actorUserId: options.actorUserId ?? website.createdBy,
        document: { title, jurisdiction: opts.jurisdiction, territory: opts.territory, scope: opts.scope },
        fields: {
          version: opts.version,
          status: opts.status,
          effectiveFrom: opts.effectiveFrom,
          effectiveUntil: opts.effectiveUntil,
          sourceNote: opts.sourceNote,
          origin: "WEB",
          file: null,
          url: page.url,
        },
        source: { type: "WEB", url: page.url, text: fetched.text },
      });
      await finishPage(page.id, { status: "INDEXED", documentId: document.id, title });
    } catch (error) {
      if (error instanceof UploadError) {
        await finishPage(page.id, { status: "FAILED", error: error.message });
      } else {
        console.error("Website page failed:", error instanceof Error ? error.name : "unknown error");
        await finishPage(page.id, {
          status: "FAILED",
          error: "No se pudo descargar la página. Comprueba que es pública y accesible.",
        });
      }
    }
  }

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(knowledgeWebsitePages)
    .where(
      and(
        eq(knowledgeWebsitePages.organizationId, organizationId),
        eq(knowledgeWebsitePages.websiteId, websiteId),
        inArray(knowledgeWebsitePages.status, ["PENDING", "INDEXING"]),
      ),
    );
  return { processed, remaining };
}

/** Replaces the publication data used for the pages indexed from now on (already indexed documents keep theirs). */
export async function updateWebsiteOptions(organizationId: string, websiteId: string, options: WebsiteOptions) {
  const updated = await db
    .update(knowledgeWebsites)
    .set({ options, updatedAt: new Date() })
    .where(and(eq(knowledgeWebsites.organizationId, organizationId), eq(knowledgeWebsites.id, websiteId)))
    .returning({ id: knowledgeWebsites.id });
  if (updated.length === 0) throw new UploadError("Sitio web no encontrado.");
}

/** Re-embeds the website's indexed documents with the active provider (only chunks of another model). */
export async function reindexWebsiteDocuments(
  organizationId: string,
  websiteId: string,
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<{ documents: number; reembedded: number }> {
  if (!hasEmbeddingProvider()) {
    throw new UploadError("El servicio de embeddings no está configurado en este entorno.");
  }
  const { pages } = await requireWebsite(organizationId, websiteId);
  const deadline = Date.now() + budgetMs;
  let documentCount = 0;
  let reembedded = 0;
  for (const page of pages) {
    if (!page.documentId || Date.now() >= deadline) continue;
    // Only documents the organization owns: a page row never grants access to anyone else's.
    const [own] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, page.documentId), eq(documents.organizationId, organizationId)))
      .limit(1);
    if (!own) continue;
    documentCount += 1;
    reembedded += (await reindexKnowledgeChunks({ documentId: own.id })).reembedded;
  }
  return { documents: documentCount, reembedded };
}

/** Removes the website and its page list; with `deleteDocuments`, also the documents indexed from it. */
export async function deleteWebsite(
  organizationId: string,
  websiteId: string,
  options: { deleteDocuments: boolean },
): Promise<{ deletedDocuments: number }> {
  const { pages } = await requireWebsite(organizationId, websiteId);
  let deletedDocuments = 0;
  await db.transaction(async (tx) => {
    if (options.deleteDocuments) {
      const ids = pages.flatMap((page) => (page.documentId ? [page.documentId] : []));
      if (ids.length > 0) {
        const removed = await tx
          .delete(documents)
          .where(
            and(
              inArray(documents.id, ids),
              eq(documents.organizationId, organizationId),
              eq(documents.visibility, "ORGANIZATION"),
            ),
          )
          .returning({ id: documents.id });
        deletedDocuments = removed.length;
      }
    }
    await tx
      .delete(knowledgeWebsites)
      .where(and(eq(knowledgeWebsites.organizationId, organizationId), eq(knowledgeWebsites.id, websiteId)));
  });
  return { deletedDocuments };
}
