import type { KnowledgeExtractor } from '@saas/core'
import { newId } from '@saas/database'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setKnowledgeSourcesForTests } from '../src/server/knowledge.ts'
import { closeFixtures, openFixtures, person, type Fixtures } from './api-helpers.ts'

let fx: Fixtures
beforeAll(async () => {
  fx = await openFixtures()
})
afterAll(() => closeFixtures(fx))
afterEach(() => setKnowledgeSourcesForTests(undefined))

/** A fictitious site: no network in CI. */
const fakeSite = (host: string): KnowledgeExtractor => ({
  extractPdf: () => Promise.reject(new Error('no pdf')),
  fetchWebText: () => Promise.resolve('texto'),
  discoverSite: () =>
    Promise.resolve({
      name: 'Normativa de prueba',
      imageUrl: null,
      source: 'FEED',
      truncated: false,
      pages: [
        { url: `https://${host}/uno`, title: 'Uno', lastModified: null },
        { url: `https://${host}/dos`, title: 'Dos', lastModified: null },
      ],
    }),
})

describe('websites through the API', () => {
  it('adds a site, lists its pages and indexes the chosen ones', async () => {
    const host = `web-${newId().slice(-8)}.example`
    setKnowledgeSourcesForTests(fakeSite(host))
    const admin = await person(fx, 'admin')
    await admin.browser.call('POST', '/api/v1/organizations', {
      name: 'Acme',
      slug: `acme-${newId().slice(-12)}`,
    })
    const added = await admin.browser.call('POST', '/api/v1/knowledge/websites', {
      url: `https://${host}`,
    })
    expect(added.status).toBe(201)
    expect(added.body).toMatchObject({ name: 'Normativa de prueba', discoverySource: 'FEED' })
    const detail = await admin.browser.call('GET', `/api/v1/knowledge/websites/${added.body.id}`)
    expect(detail.body.pages.map((p: { title: string }) => p.title).sort()).toEqual(['Dos', 'Uno'])
    const indexed = await admin.browser.call(
      'POST',
      `/api/v1/knowledge/websites/${added.body.id}/index`,
      { pageIds: [detail.body.pages[0].id] },
    )
    expect(indexed.body).toEqual({ started: 1 })
    const again = await admin.browser.call('POST', '/api/v1/knowledge/websites', {
      url: `https://${host}`,
    })
    expect(again.status).toBe(409)
    const tooMany = await admin.browser.call(
      'POST',
      `/api/v1/knowledge/websites/${added.body.id}/index`,
      { pageIds: Array.from({ length: 31 }, () => crypto.randomUUID()) },
    )
    expect(tooMany.status).toBe(400)
  })
})
