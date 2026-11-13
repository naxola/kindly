import { FakeEmbeddingProvider } from '@saas/core'
import { newId } from '@saas/database'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setEmbeddingsForTests } from '../src/server/knowledge.ts'
import {
  closeFixtures,
  invitationToken,
  openFixtures,
  person,
  type Fixtures,
} from './api-helpers.ts'

let fx: Fixtures
beforeAll(async () => {
  fx = await openFixtures()
})
afterAll(() => closeFixtures(fx))
afterEach(() => setEmbeddingsForTests(undefined))

const form = (fields: Record<string, string>, file?: { name: string; content: string }) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  if (file) f.set('file', new File([file.content], file.name))
  return f
}
const base = { origin: 'TEXT', version: '2024', effectiveFrom: '2024-01-01' }

describe('knowledge through the API', () => {
  it('administrators upload (202 pending), everyone reads, and what is wrong is a code', async () => {
    const admin = await person(fx, 'admin')
    const created = await admin.browser.call('POST', '/api/v1/organizations', {
      name: 'Acme',
      slug: `acme-${newId().slice(-12)}`,
    })
    const organizationId = created.body.id as string
    const delegate = await person(fx, 'delegate')
    await admin.browser.call('POST', '/api/v1/invitations', {
      email: delegate.email,
      firstName: 'Luis',
    })
    await delegate.browser.call('POST', '/api/v1/invitations/accept', {
      token: await invitationToken(fx, delegate.email),
    })

    // Upload: accepted at once, pending, with a job; nothing of the bytes is readable afterwards.
    let res = await admin.browser.call(
      'POST',
      '/api/v1/knowledge/documents',
      form(
        { ...base, title: 'Convenio' },
        { name: 'a.txt', content: 'Artículo 1\nLa baja se tramita en una semana.' },
      ),
    )
    expect(res.status).toBe(202)
    const { documentId, versionId } = res.body as { documentId: string; versionId: string }
    const job = await fx.jobs.query(
      `SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'knowledge.ingest-version' AND data->'payload'->>'versionId' = $1`,
      [versionId],
    )
    expect(job.rows[0].n).toBe(1)
    res = await admin.browser.call('GET', `/api/v1/knowledge/documents/${documentId}`)
    expect(res.body).toMatchObject({
      title: 'Convenio',
      visibility: 'ORGANIZATION',
      versions: [
        { version: '2024', status: 'DRAFT', ingestionStatus: 'PENDING', ingestionError: null },
      ],
    })
    expect(JSON.stringify(res.body)).not.toContain('sourceData')

    // What is wrong comes back as a code the screen translates.
    for (const [fields, file, detail] of [
      [
        { ...base, title: 'X', origin: 'PDF' },
        { name: 'a.pdf', content: 'no es pdf' },
        'NOT_A_PDF',
      ],
      [{ ...base, title: 'X' }, undefined, 'SOURCE_EMPTY'],
      [{ ...base, title: 'X', origin: 'WEB', url: 'ftp://x.es' }, undefined, 'URL_NOT_HTTP'],
    ] as const) {
      res = await admin.browser.call('POST', '/api/v1/knowledge/documents', form(fields, file))
      expect(res.status).toBe(400)
      expect(res.body.error.details[0].code).toBe(detail)
    }
    res = await admin.browser.call(
      'POST',
      '/api/v1/knowledge/documents',
      form({ ...base, title: 'X', effectiveFrom: 'ayer' }, { name: 'a.txt', content: 'hola' }),
    )
    expect(res.status).toBe(400)

    // A delegate reads but cannot upload; a stranger's document does not exist.
    res = await delegate.browser.call('GET', '/api/v1/knowledge/documents')
    expect(res.body.items.map((d: { id: string }) => d.id)).toContain(documentId)
    res = await delegate.browser.call(
      'POST',
      '/api/v1/knowledge/documents',
      form({ ...base, title: 'Intruso' }, { name: 'a.txt', content: 'hola' }),
    )
    expect(res.status).toBe(403)
    const other = await person(fx, 'other')
    await other.browser.call('POST', '/api/v1/organizations', {
      name: 'Otra',
      slug: `otra-${newId().slice(-12)}`,
    })
    expect(
      (await other.browser.call('GET', `/api/v1/knowledge/documents/${documentId}`)).status,
    ).toBe(404)
    expect(
      (
        await other.browser.call(
          'POST',
          `/api/v1/knowledge/documents/${documentId}/versions`,
          form({ ...base }, { name: 'a.txt', content: 'hola' }),
        )
      ).status,
    ).toBe(404)

    // New version of an own document: accepted.
    res = await admin.browser.call(
      'POST',
      `/api/v1/knowledge/documents/${documentId}/versions`,
      form(
        { ...base, version: '2026', effectiveFrom: '2026-01-01' },
        { name: 'b.txt', content: 'Artículo 1\nTres días.' },
      ),
    )
    expect(res.status).toBe(202)

    // Search needs an embedding provider: without one it says so (503) instead of a half answer.
    setEmbeddingsForTests(null)
    res = await delegate.browser.call('GET', '/api/v1/knowledge/search?q=baja')
    expect(res.status).toBe(503)
    expect(res.body.error.details).toEqual([{ code: 'EMBEDDINGS_NOT_CONFIGURED' }])

    // Once the version is ready (here, the same use case the worker runs) it is found, with its citation.
    setEmbeddingsForTests(new FakeEmbeddingProvider())
    const { ingestVersion } = await import('@saas/core')
    await ingestVersion(
      {
        db: fx.db,
        embeddings: new FakeEmbeddingProvider(),
        extractor: {
          extractPdf: () => Promise.reject(new Error('x')),
          fetchWebText: () => Promise.reject(new Error('x')),
        },
      },
      organizationId,
      versionId,
      { number: 0, limit: 3 },
    )
    res = await delegate.browser.call('GET', '/api/v1/knowledge/search?q=baja%20semana')
    expect(res.status).toBe(200)
    expect(res.body.items[0]).toMatchObject({
      documentTitle: 'Convenio',
      version: '2024',
      status: 'CURRENT',
      effectiveFrom: '2024-01-01',
      visibility: 'ORGANIZATION',
      label: 'Artículo 1',
    })
    expect(
      (await delegate.browser.call('GET', '/api/v1/knowledge/search?q=baja&atDate=1999-01-01')).body
        .items,
    ).toEqual([])
    res = await delegate.browser.call('GET', `/api/v1/knowledge/versions/${versionId}/chunks`)
    expect(res.body.items).toHaveLength(1)
    expect((await delegate.browser.call('GET', '/api/v1/knowledge/search?q=')).status).toBe(400)
  })
})
