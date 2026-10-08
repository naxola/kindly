/**
 * Bulk import of web pages into the knowledge base (knowledge step 2): an
 * ADMIN picks pages discovered on a site (`ingestion/site-discovery.ts`);
 * each becomes a row in `knowledge_import_pages` and is then indexed as a
 * normal ORGANIZATION document through `uploadKnowledgeDocument`.
 *
 * Background work without a queue (`CLAUDE.md` §2): `processImportBatch`
 * indexes pages in time-boxed slices. A page is *claimed* with one atomic
 * `UPDATE … FOR UPDATE SKIP LOCKED`, so two slices running at once never
 * take the same page, and a page left INDEXING by a crashed slice is taken
 * over after a lease. The first slice runs from `after()` in the action that
 * creates the batch; the progress page keeps calling more slices while pages
 * remain, so a long import survives a function timeout.
 */
import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  documents,
  knowledgeImportPages,
  type ImportPageOptions,
  type ImportPageStatus,
} from "@/modules/knowledge/schema";
import { hasEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { fetchWebPage } from "@/modules/knowledge/ingestion/extract-web";
import { isSameSite, isSitePage, normalizePageUrl } from "@/modules/knowledge/ingestion/site-discovery";
import { MAX_IMPORT_PAGES } from "@/modules/knowledge/source-status";
import { UploadError, uploadKnowledgeDocument } from "@/modules/knowledge/upload";

export const MAX_BATCH_PAGES = MAX_IMPORT_PAGES;
const CLAIM_LEASE_MINUTES = 3;
const DEFAULT_BUDGET_MS = 40_000;
const DEFAULT_PAUSE_MS = 250;

export interface ImportSelection {
  url: string;
  title: string | null;
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

export async function createImportBatch(input: {
  organizationId: string;
  actorUserId: string;
  siteUrl: string;
  pages: ImportSelection[];
  options: ImportPageOptions;
}): Promise<{ batchId: string; queued: number; skipped: number }> {
  let site: URL;
  try {
    site = new URL(input.siteUrl);
  } catch {
    throw new UploadError("La dirección del sitio no es válida.");
  }

  const chosen = new Map<string, ImportSelection>();
  for (const page of input.pages) {
    if (!isSitePage(page.url, site)) continue;
    const url = normalizePageUrl(page.url);
    if (!chosen.has(url)) chosen.set(url, { url, title: page.title?.trim() || null });
  }
  if (chosen.size === 0) {
    throw new UploadError("Elige al menos una página.");
  }
  if (chosen.size > MAX_BATCH_PAGES) {
    throw new UploadError(`Elige como máximo ${MAX_BATCH_PAGES} páginas por importación.`);
  }

  // Pages the organization already has as a document, or is already importing.
  const existingByUrl = await existingSourceUrls(input.organizationId);
  const inFlight = new Set(
    (
      await db
        .select({ url: knowledgeImportPages.url })
        .from(knowledgeImportPages)
        .where(
          and(
            eq(knowledgeImportPages.organizationId, input.organizationId),
            inArray(knowledgeImportPages.status, ["PENDING", "INDEXING"]),
          ),
        )
    ).map((row) => row.url),
  );

  const batchId = crypto.randomUUID();
  const rows = [...chosen.values()].map((page) => {
    const documentId = existingByUrl.get(page.url) ?? null;
    const skipReason = documentId ? "Ya estaba añadida." : inFlight.has(page.url) ? "Ya se está importando." : null;
    return {
      organizationId: input.organizationId,
      batchId,
      siteUrl: site.href,
      url: page.url,
      title: page.title,
      status: (skipReason ? "SKIPPED" : "PENDING") as ImportPageStatus,
      error: skipReason,
      documentId,
      options: input.options,
      createdBy: input.actorUserId,
    };
  });
  await db.insert(knowledgeImportPages).values(rows);

  const skipped = rows.filter((row) => row.status === "SKIPPED").length;
  return { batchId, queued: rows.length - skipped, skipped };
}

type ClaimedPage = {
  id: string;
  url: string;
  title: string | null;
  site_url: string;
  options: ImportPageOptions;
  created_by: string | null;
};

async function claimNextPage(organizationId: string, batchId: string): Promise<ClaimedPage | null> {
  const rows = await db.execute<ClaimedPage>(sql`
    update knowledge_import_pages
    set status = 'INDEXING', started_at = now(), updated_at = now()
    where id = (
      select id from knowledge_import_pages
      where organization_id = ${organizationId}
        and batch_id = ${batchId}
        and (status = 'PENDING'
             or (status = 'INDEXING' and started_at < now() - make_interval(mins => ${CLAIM_LEASE_MINUTES})))
      order by created_at, id
      limit 1
      for update skip locked
    )
    returning id, url, title, site_url, options, created_by
  `);
  return rows[0] ?? null;
}

async function finishPage(
  id: string,
  result: { status: "INDEXED"; documentId: string; title: string } | { status: "FAILED"; error: string },
) {
  await db
    .update(knowledgeImportPages)
    .set(
      result.status === "INDEXED"
        ? { status: "INDEXED", documentId: result.documentId, title: result.title, error: null, updatedAt: new Date() }
        : { status: "FAILED", error: result.error, updatedAt: new Date() },
    )
    .where(eq(knowledgeImportPages.id, id));
}

function fallbackTitle(url: string): string {
  const { hostname, pathname } = new URL(url);
  const slug = decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " ").trim();
  return slug || hostname;
}

export interface ProcessOptions {
  /** Stop starting new pages after this long (a Vercel function has a hard limit). */
  budgetMs?: number;
  pauseMs?: number;
  /** Injectable for tests — never a real network call in CI. */
  fetchPage?: typeof fetchWebPage;
}

/** Indexes pending pages of one batch for up to `budgetMs`. Returns how many are still to do. */
export async function processImportBatch(
  organizationId: string,
  batchId: string,
  options: ProcessOptions = {},
): Promise<{ processed: number; remaining: number }> {
  if (!hasEmbeddingProvider()) {
    throw new UploadError("El servicio de embeddings no está configurado en este entorno.");
  }
  const fetchPage = options.fetchPage ?? fetchWebPage;
  const deadline = Date.now() + (options.budgetMs ?? DEFAULT_BUDGET_MS);
  let processed = 0;

  while (Date.now() < deadline) {
    const page = await claimNextPage(organizationId, batchId);
    if (!page) break;
    if (processed > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.pauseMs ?? DEFAULT_PAUSE_MS));
    }
    processed += 1;

    try {
      if (!isSameSite(page.url, new URL(page.site_url))) {
        await finishPage(page.id, { status: "FAILED", error: "La página no pertenece al sitio elegido." });
        continue;
      }
      const fetched = await fetchPage(page.url);
      const title = fetched.title ?? page.title ?? fallbackTitle(page.url);
      const opts = page.options;
      const document = await uploadKnowledgeDocument({
        organizationId,
        actorUserId: page.created_by,
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
        console.error("Site import page failed:", error instanceof Error ? error.name : "unknown error");
        await finishPage(page.id, {
          status: "FAILED",
          error: "No se pudo descargar la página. Comprueba que es pública y accesible.",
        });
      }
    }
  }

  const [{ remaining }] = await db
    .select({ remaining: sql<number>`count(*)::int` })
    .from(knowledgeImportPages)
    .where(
      and(
        eq(knowledgeImportPages.organizationId, organizationId),
        eq(knowledgeImportPages.batchId, batchId),
        inArray(knowledgeImportPages.status, ["PENDING", "INDEXING"]),
      ),
    );
  return { processed, remaining };
}

/** The pages of one batch, scoped to the organization (another organization's batch is simply empty). */
export async function getImportBatch(organizationId: string, batchId: string) {
  return db
    .select()
    .from(knowledgeImportPages)
    .where(and(eq(knowledgeImportPages.organizationId, organizationId), eq(knowledgeImportPages.batchId, batchId)))
    .orderBy(knowledgeImportPages.createdAt, knowledgeImportPages.id);
}

/** Recent import batches of the organization, newest first, for the "Importaciones" history. */
export async function listRecentImportBatches(organizationId: string, limit = 5) {
  return db
    .select({
      batchId: knowledgeImportPages.batchId,
      siteUrl: sql<string>`min(${knowledgeImportPages.siteUrl})`,
      createdAt: sql<string>`min(${knowledgeImportPages.createdAt})`,
      total: sql<number>`count(*)::int`,
      indexed: sql<number>`(count(*) filter (where ${knowledgeImportPages.status} = 'INDEXED'))::int`,
      failed: sql<number>`(count(*) filter (where ${knowledgeImportPages.status} = 'FAILED'))::int`,
      open: sql<number>`(count(*) filter (where ${knowledgeImportPages.status} in ('PENDING', 'INDEXING')))::int`,
    })
    .from(knowledgeImportPages)
    .where(eq(knowledgeImportPages.organizationId, organizationId))
    .groupBy(knowledgeImportPages.batchId)
    .orderBy(desc(sql`min(${knowledgeImportPages.createdAt})`))
    .limit(limit);
}

/** FAILED pages go back to PENDING so the next slice retries them. */
export async function retryFailedImportPages(organizationId: string, batchId: string): Promise<number> {
  const rows = await db
    .update(knowledgeImportPages)
    .set({ status: "PENDING", error: null, startedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(knowledgeImportPages.organizationId, organizationId),
        eq(knowledgeImportPages.batchId, batchId),
        eq(knowledgeImportPages.status, "FAILED"),
      ),
    )
    .returning({ id: knowledgeImportPages.id });
  return rows.length;
}
