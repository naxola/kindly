import { withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  addWebsite,
  addWebsitePage,
  deleteWebsite,
  FakeEmbeddingProvider,
  getWebsite,
  indexWebsitePages,
  ingestVersion,
  listWebsites,
  rediscoverWebsite,
  updateWebsiteSettings,
  type KnowledgeExtractor,
  type SiteDiscovery,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue, type Org } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

let seq = 0
/** A fictitious site on its own host, with the pages its sitemap offers (no network in CI). */
function fakeSite(pages: string[], over: Partial<SiteDiscovery> = {}) {
  const host = `sitio-${Date.now()}-${++seq}.example`
  const state = { pages, failing: false }
  const extractor: KnowledgeExtractor = {
    extractPdf: () => Promise.reject(new Error('no pdf')),
    fetchWebText: (url) => Promise.resolve(`Texto de ${url}. Artículo 1. Contenido suficiente.`),
    discoverSite: () =>
      state.failing
        ? Promise.reject(new Error('ECONNREFUSED 10.0.0.1 secret detail'))
        : Promise.resolve({
            name: 'Sitio de prueba',
            imageUrl: `https://${host}/og.png`,
            source: 'SITEMAP',
            truncated: false,
            pages: state.pages.map((p) => ({
              url: `https://${host}${p}`,
              title: null,
              lastModified: null,
            })),
            ...over,
          }),
  }
  return { host, url: `https://${host}`, extractor, state }
}

const ingestAll = async (org: Org, extractor: KnowledgeExtractor) => {
  const pending = await withTenant(db, org.organization.id, (tx) =>
    tx.knowledgeDocumentVersion.findMany({
      where: { ingestionStatus: 'PENDING' },
      select: { id: true },
    }),
  )
  for (const v of pending) {
    await ingestVersion(
      { db, embeddings: new FakeEmbeddingProvider(), extractor },
      org.organization.id,
      v.id,
      { number: 3, limit: 3 },
    )
  }
}

describe('websites as knowledge sources', () => {
  it('adds a site with the pages it offers (same site only, without repeats); nothing is indexed', async () => {
    const admin = await adminWithOrg()
    const site = fakeSite(['/a', '/a/', '/b#x', '/c'])
    const before = queue.of('knowledge.ingest-version').length
    const added = await addWebsite(admin.ctx, site.extractor, { url: `${site.url}/` })
    expect(added).toMatchObject({
      url: `${site.url}/`,
      name: 'Sitio de prueba',
      discoverySource: 'SITEMAP',
      counts: { total: 3, DISCOVERED: 3 },
    })
    expect(queue.of('knowledge.ingest-version')).toHaveLength(before)
    expect(await codeOf(addWebsite(admin.ctx, site.extractor, { url: site.url }))).toEqual({
      code: 'CONFLICT',
      detail: 'WEBSITE_EXISTS',
    })
    expect((await listWebsites(admin.ctx)).map((w) => w.id)).toContain(added.id)
  })

  it('a site without sitemap nor feed offers its own address; an unreachable one stores nothing', async () => {
    const admin = await adminWithOrg()
    const bare = fakeSite([], { source: 'NONE' })
    const site = await addWebsite(admin.ctx, bare.extractor, { url: bare.url })
    const { pages } = await getWebsite(admin.ctx, site.id)
    expect(pages.map((p) => p.url)).toEqual([`${bare.url}/`])

    const down = fakeSite(['/x'])
    down.state.failing = true
    expect(await codeOf(addWebsite(admin.ctx, down.extractor, { url: down.url }))).toEqual({
      code: 'VALIDATION_FAILED',
      detail: 'SITE_UNREACHABLE',
    })
    expect(await codeOf(addWebsite(admin.ctx, down.extractor, { url: 'ftp://x.example' }))).toEqual(
      {
        code: 'VALIDATION_FAILED',
        detail: 'URL_NOT_HTTP',
      },
    )
  })

  it('indexing turns the chosen pages into documents with the site publication data', async () => {
    const admin = await adminWithOrg()
    const site = fakeSite(['/a', '/b', '/c'])
    const added = await addWebsite(admin.ctx, site.extractor, { url: site.url })
    await updateWebsiteSettings(admin.ctx, added.id, {
      name: 'Normativa',
      version: '2026',
      publishAsCurrent: true,
      effectiveFrom: '2026-01-01',
      jurisdiction: 'ES',
    })
    const { pages } = await getWebsite(admin.ctx, added.id)
    const [a, b] = pages
    const { started } = await indexWebsitePages(admin.ctx, added.id, { pageIds: [a!.id, b!.id] })
    expect(started).toBe(2)
    let detail = await getWebsite(admin.ctx, added.id)
    expect(detail.website.counts).toMatchObject({ INDEXING: 2, DISCOVERED: 1 })

    await ingestAll(admin, site.extractor)
    detail = await getWebsite(admin.ctx, added.id)
    expect(detail.website.counts).toMatchObject({ INDEXED: 2, DISCOVERED: 1 })
    const version = await withTenant(db, admin.organization.id, (tx) =>
      tx.knowledgeDocumentVersion.findFirstOrThrow({
        where: { documentId: detail.pages.find((p) => p.id === a!.id)!.documentId! },
        include: { document: true },
      }),
    )
    expect(version).toMatchObject({ version: '2026', status: 'CURRENT' })
    expect(version.document).toMatchObject({ jurisdiction: 'ES', sourceType: 'WEB' })
    // Indexing them again does nothing: they are indexed already.
    expect(await indexWebsitePages(admin.ctx, added.id, { pageIds: [a!.id] })).toEqual({
      started: 0,
    })
  })

  it('a failed page can be retried; it gets a new version of the same document', async () => {
    const admin = await adminWithOrg()
    const site = fakeSite(['/vacia'])
    const added = await addWebsite(admin.ctx, site.extractor, { url: site.url })
    const [page] = (await getWebsite(admin.ctx, added.id)).pages
    await indexWebsitePages(admin.ctx, added.id, { pageIds: [page!.id] })
    const empty: KnowledgeExtractor = {
      ...site.extractor,
      fetchWebText: () => Promise.resolve('   '),
    }
    await ingestAll(admin, empty)
    const failed = (await getWebsite(admin.ctx, added.id)).pages[0]!
    expect(failed).toMatchObject({ status: 'FAILED', error: 'EMPTY_DOCUMENT' })
    expect(await indexWebsitePages(admin.ctx, added.id, { pageIds: [page!.id] })).toEqual({
      started: 1,
    })
    await ingestAll(admin, site.extractor)
    const retried = (await getWebsite(admin.ctx, added.id)).pages[0]!
    expect(retried).toMatchObject({ status: 'INDEXED', documentId: failed.documentId })
  })

  it('pages are added by hand only from the same site; looking again adds only the new ones', async () => {
    const admin = await adminWithOrg()
    const site = fakeSite(['/a'])
    const added = await addWebsite(admin.ctx, site.extractor, { url: site.url })
    expect(
      await addWebsitePage(admin.ctx, added.id, { url: `https://www.${site.host}/b/` }),
    ).toMatchObject({
      url: `https://www.${site.host}/b`,
      status: 'DISCOVERED',
    })
    expect(
      await codeOf(addWebsitePage(admin.ctx, added.id, { url: 'https://otro.example/x' })),
    ).toEqual({
      code: 'VALIDATION_FAILED',
      detail: 'PAGE_OTHER_SITE',
    })
    expect(await codeOf(addWebsitePage(admin.ctx, added.id, { url: `${site.url}/a` }))).toEqual({
      code: 'CONFLICT',
      detail: 'PAGE_EXISTS',
    })
    site.state.pages = ['/a', '/nueva']
    expect(await rediscoverWebsite(admin.ctx, site.extractor, added.id)).toEqual({ added: 1 })
    expect((await getWebsite(admin.ctx, added.id)).website.counts.total).toBe(3)
  })

  it('removing the site keeps the documents indexed from it', async () => {
    const admin = await adminWithOrg()
    const site = fakeSite(['/a'])
    const added = await addWebsite(admin.ctx, site.extractor, { url: site.url })
    const [page] = (await getWebsite(admin.ctx, added.id)).pages
    await indexWebsitePages(admin.ctx, added.id, { pageIds: [page!.id] })
    const { documentId } = (await getWebsite(admin.ctx, added.id)).pages[0]!
    await deleteWebsite(admin.ctx, added.id)
    expect(await codeOf(getWebsite(admin.ctx, added.id))).toMatchObject({ code: 'NOT_FOUND' })
    const doc = await withTenant(db, admin.organization.id, (tx) =>
      tx.knowledgeDocument.findUnique({ where: { id: documentId! } }),
    )
    expect(doc).not.toBeNull()
  })

  it('only administrators, and only of their organization', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const site = fakeSite(['/a'])
    const added = await addWebsite(admin.ctx, site.extractor, { url: site.url })
    expect(await codeOf(listWebsites(luis.ctx))).toMatchObject({ code: 'FORBIDDEN' })
    expect(
      await codeOf(addWebsite(luis.ctx, site.extractor, { url: 'https://x.example' })),
    ).toMatchObject({
      code: 'FORBIDDEN',
    })
    const other = await adminWithOrg('Otra')
    expect(await codeOf(getWebsite(other.ctx, added.id))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await codeOf(deleteWebsite(other.ctx, added.id))).toMatchObject({ code: 'NOT_FOUND' })
  })
})
