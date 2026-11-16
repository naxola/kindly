import { withTenant, type KnowledgeWebsite, type Prisma, type TenantTx } from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'
import type { DiscoveredSitePage, KnowledgeExtractor, SiteDiscovery } from './extractor.ts'
import { validateWebUrl } from './ingestion-rules.ts'
import { submitDocument, submitVersion } from './ingestion.ts'
import { optionalText } from '../../validation.ts'

/**
 * A website as a knowledge source (ported from the previous app; docs/DECISIONS.md 2026-11-16):
 * the administrator adds the site, Kindly lists the pages its sitemap or feed offers (no crawling),
 * and the administrator picks which to index. Each picked page becomes an ORGANIZATION document
 * ingested by the usual job (`knowledge.ingest-version`): no separate indexing machinery. A page's
 * state is its document's: none yet, or the ingestion status of its latest version.
 */

/** Pages one indexing request may start (bounds the embedding cost of a single click). */
export const MAX_PAGES_PER_INDEXING = 30

const withoutWww = (hostname: string) => hostname.replace(/^www\./i, '').toLowerCase()

/** Drops the fragment and a trailing slash, so `/a`, `/a/` and `/a#x` count once. */
export function normalizePageUrl(raw: string): string {
  const url = new URL(raw)
  url.hash = ''
  if (url.pathname.length > 1 && url.pathname.endsWith('/'))
    url.pathname = url.pathname.slice(0, -1)
  return url.href
}

/** http(s) and the same host as the site (ignoring `www.`). */
export function isSameSite(candidate: string, site: string): boolean {
  try {
    const url = new URL(candidate)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      withoutWww(url.hostname) === withoutWww(new URL(site).hostname)
    )
  } catch {
    return false
  }
}

export type WebsitePageStatus = 'DISCOVERED' | 'INDEXING' | 'INDEXED' | 'FAILED'

export interface WebsitePageView {
  id: string
  url: string
  title: string | null
  status: WebsitePageStatus
  documentId: string | null
  /** Stable code of a failed ingestion (`knowledge.ingestionErrors.*`). */
  error: string | null
}

export interface WebsiteSettings {
  version: string
  publishAsCurrent: boolean
  effectiveFrom: string | null
  effectiveUntil: string | null
  sourceNote: string | null
  jurisdiction: string | null
  territory: string | null
  scope: string | null
}

export interface WebsiteView {
  id: string
  url: string
  name: string
  imageUrl: string | null
  discoverySource: 'SITEMAP' | 'FEED' | 'NONE'
  truncated: boolean
  discoveredAt: Date
  createdAt: Date
  counts: Record<WebsitePageStatus, number> & { total: number }
  settings: WebsiteSettings
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

const settingsOf = (w: KnowledgeWebsite): WebsiteSettings => ({
  version: w.version,
  publishAsCurrent: w.publishAsCurrent,
  effectiveFrom: day(w.effectiveFrom),
  effectiveUntil: day(w.effectiveUntil),
  sourceNote: w.sourceNote,
  jurisdiction: w.jurisdiction,
  territory: w.territory,
  scope: w.scope,
})

async function pagesWithStatus(tx: TenantTx, websiteId: string): Promise<WebsitePageView[]> {
  const pages = await tx.knowledgeWebsitePage.findMany({
    where: { websiteId },
    orderBy: [{ lastModified: { sort: 'desc', nulls: 'last' } }, { url: 'asc' }],
    include: {
      document: {
        select: {
          id: true,
          title: true,
          versions: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { ingestionStatus: true, ingestionError: true },
          },
        },
      },
    },
  })
  return pages.map((p) => {
    const latest = p.document?.versions[0]
    const status: WebsitePageStatus = !p.document
      ? 'DISCOVERED'
      : latest?.ingestionStatus === 'READY'
        ? 'INDEXED'
        : latest?.ingestionStatus === 'FAILED'
          ? 'FAILED'
          : 'INDEXING'
    return {
      id: p.id,
      url: p.url,
      title: p.title ?? p.document?.title ?? null,
      status,
      documentId: p.documentId,
      error: status === 'FAILED' ? (latest?.ingestionError ?? null) : null,
    }
  })
}

function viewOf(w: KnowledgeWebsite, pages: WebsitePageView[]): WebsiteView {
  const counts = { total: pages.length, DISCOVERED: 0, INDEXING: 0, INDEXED: 0, FAILED: 0 }
  for (const p of pages) counts[p.status]++
  return {
    id: w.id,
    url: w.url,
    name: w.name,
    imageUrl: w.imageUrl,
    discoverySource: w.discoverySource,
    truncated: w.truncated,
    discoveredAt: w.discoveredAt,
    createdAt: w.createdAt,
    counts,
    settings: settingsOf(w),
  }
}

async function findWebsite(tx: TenantTx, websiteId: string): Promise<KnowledgeWebsite> {
  const site = await tx.knowledgeWebsite.findUnique({ where: { id: websiteId } })
  if (!site) throw new DomainError('NOT_FOUND', 'Website not found')
  return site
}

const audit = (
  ctx: Ctx,
  tx: TenantTx,
  action: string,
  websiteId: string,
  after?: Prisma.InputJsonValue,
) =>
  writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'knowledge_website',
    resourceId: websiteId,
    ...(after ? { after } : {}),
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })

async function discover(extractor: KnowledgeExtractor, url: string): Promise<SiteDiscovery> {
  if (!extractor.discoverSite) {
    throw new DomainError('SERVICE_UNAVAILABLE', 'Website discovery is not available here')
  }
  try {
    return await extractor.discoverSite(url)
  } catch {
    // Never the provider's or the network's message: a stable code.
    throw new DomainError('VALIDATION_FAILED', 'The website could not be read', [
      { path: 'url', code: 'SITE_UNREACHABLE' },
    ])
  }
}

/** Keeps the discovered pages that belong to the site, normalized and without repeats. */
function sitePages(site: string, pages: DiscoveredSitePage[]): DiscoveredSitePage[] {
  const seen = new Set<string>()
  const out: DiscoveredSitePage[] = []
  for (const p of pages) {
    if (!isSameSite(p.url, site)) continue
    const url = normalizePageUrl(p.url)
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ ...p, url })
  }
  return out
}

/** Links pages to a document the organization already has from that same address. */
async function existingDocuments(tx: TenantTx, organizationId: string, urls: string[]) {
  const docs = await tx.knowledgeDocument.findMany({
    where: { organizationId, sourceType: 'WEB', sourceUrl: { in: urls } },
    select: { id: true, sourceUrl: true },
  })
  return new Map(docs.map((d) => [d.sourceUrl!, d.id]))
}

export const AddWebsiteInput = z.object({ url: z.string().trim().min(1).max(2000) })
export type AddWebsiteInput = z.input<typeof AddWebsiteInput>

/** Adds a website and lists the pages it offers. Nothing is indexed yet. */
export async function addWebsite(
  ctx: Ctx,
  extractor: KnowledgeExtractor,
  input: AddWebsiteInput,
): Promise<WebsiteView> {
  authorize(ctx.actor, 'knowledge.write')
  const checked = validateWebUrl(AddWebsiteInput.parse(input).url)
  if (!checked.ok) {
    throw new DomainError('VALIDATION_FAILED', 'The address is not valid', [
      { path: 'url', code: checked.code },
    ])
  }
  const url = normalizePageUrl(checked.value)
  const exists = await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.knowledgeWebsite.findFirst({ where: { url }, select: { id: true } }),
  )
  if (exists) {
    throw new DomainError('CONFLICT', 'The website is already added', [{ code: 'WEBSITE_EXISTS' }])
  }
  const found = await discover(extractor, url)
  const pages = sitePages(url, found.pages)
  // A site with neither sitemap nor feed: offer its own address, and the admin adds more by hand.
  if (pages.length === 0) pages.push({ url, title: found.name, lastModified: null })
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const site = await tx.knowledgeWebsite.create({
      data: {
        organizationId: ctx.actor.organizationId,
        url,
        name: found.name?.slice(0, 200) || new URL(url).hostname,
        imageUrl: found.imageUrl,
        discoverySource: found.source,
        truncated: found.truncated,
        discoveredAt: ctx.now?.() ?? new Date(),
      },
    })
    const docs = await existingDocuments(
      tx,
      ctx.actor.organizationId,
      pages.map((p) => p.url),
    )
    await tx.knowledgeWebsitePage.createMany({
      data: pages.map((p) => ({
        organizationId: ctx.actor.organizationId,
        websiteId: site.id,
        url: p.url,
        title: p.title?.slice(0, 300) ?? null,
        lastModified: p.lastModified?.slice(0, 60) ?? null,
        documentId: docs.get(p.url) ?? null,
      })),
    })
    await audit(ctx, tx, 'knowledge.website_added', site.id, { pages: pages.length })
    return viewOf(site, await pagesWithStatus(tx, site.id))
  })
}

export async function listWebsites(ctx: Ctx): Promise<WebsiteView[]> {
  authorize(ctx.actor, 'knowledge.write')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const sites = await tx.knowledgeWebsite.findMany({ orderBy: [{ createdAt: 'desc' }] })
    return Promise.all(sites.map(async (s) => viewOf(s, await pagesWithStatus(tx, s.id))))
  })
}

export async function getWebsite(
  ctx: Ctx,
  websiteId: string,
): Promise<{ website: WebsiteView; pages: WebsitePageView[] }> {
  authorize(ctx.actor, 'knowledge.write')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const site = await findWebsite(tx, websiteId)
    const pages = await pagesWithStatus(tx, site.id)
    return { website: viewOf(site, pages), pages }
  })
}

export const IndexPagesInput = z.object({
  pageIds: z.array(z.uuid()).min(1).max(MAX_PAGES_PER_INDEXING),
})
export type IndexPagesInput = z.input<typeof IndexPagesInput>

/**
 * Starts indexing the chosen pages with the site's publication data: a page without a document
 * gets one; a failed one gets a new version (a retry). Pages already indexed or indexing are left
 * as they are. Each submission enqueues its own ingestion job.
 */
export async function indexWebsitePages(
  ctx: Ctx,
  websiteId: string,
  input: IndexPagesInput,
): Promise<{ started: number }> {
  authorize(ctx.actor, 'knowledge.write')
  const { pageIds } = IndexPagesInput.parse(input)
  const { site, pages } = await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const site = await findWebsite(tx, websiteId)
    const all = await pagesWithStatus(tx, site.id)
    const wanted = new Set(pageIds)
    return { site, pages: all.filter((p) => wanted.has(p.id)) }
  })
  const version = {
    version: site.version,
    status: site.publishAsCurrent ? ('CURRENT' as const) : ('DRAFT' as const),
    effectiveFrom: day(site.effectiveFrom) ?? new Date().toISOString().slice(0, 10),
    effectiveUntil: day(site.effectiveUntil),
    source: site.sourceNote,
  }
  let started = 0
  for (const page of pages) {
    if (page.status === 'DISCOVERED') {
      const { documentId } = await submitDocument(
        ctx,
        {
          title: page.title?.slice(0, 300) || new URL(page.url).pathname || page.url,
          jurisdiction: site.jurisdiction,
          territory: site.territory,
          scope: site.scope,
        },
        version,
        { kind: 'WEB', url: page.url },
      )
      await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
        tx.knowledgeWebsitePage.update({ where: { id: page.id }, data: { documentId } }),
      )
      started++
    } else if (page.status === 'FAILED' && page.documentId) {
      await submitVersion(ctx, page.documentId, version, { kind: 'WEB', url: page.url })
      started++
    }
  }
  return { started }
}

export const AddWebsitePageInput = z.object({ url: z.string().trim().min(1).max(2000) })

/** Adds a page of the same site by its address (useful when the site has no sitemap nor feed). */
export async function addWebsitePage(
  ctx: Ctx,
  websiteId: string,
  input: z.input<typeof AddWebsitePageInput>,
): Promise<WebsitePageView> {
  authorize(ctx.actor, 'knowledge.write')
  const checked = validateWebUrl(AddWebsitePageInput.parse(input).url)
  if (!checked.ok) {
    throw new DomainError('VALIDATION_FAILED', 'The address is not valid', [
      { path: 'url', code: checked.code },
    ])
  }
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const site = await findWebsite(tx, websiteId)
    if (!isSameSite(checked.value, site.url)) {
      throw new DomainError('VALIDATION_FAILED', 'The page belongs to another site', [
        { path: 'url', code: 'PAGE_OTHER_SITE' },
      ])
    }
    const url = normalizePageUrl(checked.value)
    if (await tx.knowledgeWebsitePage.findFirst({ where: { websiteId, url } })) {
      throw new DomainError('CONFLICT', 'The page is already listed', [{ code: 'PAGE_EXISTS' }])
    }
    const docs = await existingDocuments(tx, ctx.actor.organizationId, [url])
    const page = await tx.knowledgeWebsitePage.create({
      data: {
        organizationId: ctx.actor.organizationId,
        websiteId,
        url,
        documentId: docs.get(url) ?? null,
      },
    })
    return (await pagesWithStatus(tx, websiteId)).find((p) => p.id === page.id)!
  })
}

/** Looks for pages again; only the new ones are added. */
export async function rediscoverWebsite(
  ctx: Ctx,
  extractor: KnowledgeExtractor,
  websiteId: string,
): Promise<{ added: number }> {
  authorize(ctx.actor, 'knowledge.write')
  const site = await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    findWebsite(tx, websiteId),
  )
  const found = await discover(extractor, site.url)
  const pages = sitePages(site.url, found.pages)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const docs = await existingDocuments(
      tx,
      ctx.actor.organizationId,
      pages.map((p) => p.url),
    )
    const { count } = await tx.knowledgeWebsitePage.createMany({
      data: pages.map((p) => ({
        organizationId: ctx.actor.organizationId,
        websiteId,
        url: p.url,
        title: p.title?.slice(0, 300) ?? null,
        lastModified: p.lastModified?.slice(0, 60) ?? null,
        documentId: docs.get(p.url) ?? null,
      })),
      skipDuplicates: true,
    })
    await tx.knowledgeWebsite.update({
      where: { id: websiteId },
      data: {
        discoverySource: found.source,
        truncated: found.truncated,
        discoveredAt: ctx.now?.() ?? new Date(),
      },
    })
    await audit(ctx, tx, 'knowledge.website_rediscovered', websiteId, { added: count })
    return { added: count }
  })
}

const isoDay = z.iso.date()

export const WebsiteSettingsInput = z
  .object({
    name: z.string().trim().min(1).max(200),
    version: z.string().trim().min(1).max(60),
    publishAsCurrent: z.boolean(),
    effectiveFrom: isoDay.nullish(),
    effectiveUntil: isoDay.nullish(),
    sourceNote: optionalText(600),
    jurisdiction: optionalText(120),
    territory: optionalText(120),
    scope: optionalText(120),
  })
  .refine((v) => !v.effectiveUntil || !v.effectiveFrom || v.effectiveUntil >= v.effectiveFrom, {
    path: ['effectiveUntil'],
    message: 'The validity cannot end before it starts',
  })
export type WebsiteSettingsInput = z.input<typeof WebsiteSettingsInput>

/** The name and the publication data of what is indexed from now on. */
export async function updateWebsiteSettings(
  ctx: Ctx,
  websiteId: string,
  input: WebsiteSettingsInput,
): Promise<WebsiteView> {
  authorize(ctx.actor, 'knowledge.write')
  const v = WebsiteSettingsInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await findWebsite(tx, websiteId)
    const site = await tx.knowledgeWebsite.update({
      where: { id: websiteId },
      data: {
        name: v.name,
        version: v.version,
        publishAsCurrent: v.publishAsCurrent,
        effectiveFrom: v.effectiveFrom ? new Date(v.effectiveFrom) : null,
        effectiveUntil: v.effectiveUntil ? new Date(v.effectiveUntil) : null,
        sourceNote: v.sourceNote ?? null,
        jurisdiction: v.jurisdiction ?? null,
        territory: v.territory ?? null,
        scope: v.scope ?? null,
      },
    })
    await audit(ctx, tx, 'knowledge.website_updated', websiteId)
    return viewOf(site, await pagesWithStatus(tx, websiteId))
  })
}

/** Removes the site and its page list. The documents indexed from it stay in the knowledge base. */
export async function deleteWebsite(ctx: Ctx, websiteId: string): Promise<void> {
  authorize(ctx.actor, 'knowledge.write')
  await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await findWebsite(tx, websiteId)
    await tx.knowledgeWebsitePage.deleteMany({ where: { websiteId } })
    await tx.knowledgeWebsite.delete({ where: { id: websiteId } })
    await audit(ctx, tx, 'knowledge.website_deleted', websiteId)
  })
}
