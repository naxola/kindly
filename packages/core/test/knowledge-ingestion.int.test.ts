import { createDb, withTenant } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  FakeEmbeddingProvider,
  getDocument,
  ingestGlobalDocument,
  ingestVersion,
  ingestVersionJob,
  listChunks,
  listDocuments,
  submitDocument,
  submitVersion,
  type KnowledgeExtractor,
  createDocument,
  createDocumentVersion,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember, queue } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const enc = (s: string) => new TextEncoder().encode(s)
const pdfBytes = enc('%PDF-1.7\nfake pdf body')
const embeddings = new FakeEmbeddingProvider()
const extractor: KnowledgeExtractor = {
  extractPdf: () => Promise.resolve('Artículo 1\nLa baja por incapacidad temporal.'),
  fetchWebText: (url) => Promise.resolve(`Texto de ${url}\n\nArtículo 2\nPermisos retribuidos.`),
}
const deps = { db, embeddings, extractor }
const fields = { version: '2026', effectiveFrom: '2026-01-01' }
const first = { number: 0, limit: 3 }
const last = { number: 3, limit: 3 }

/** A raw read of the version, including what reads never expose (the uploaded bytes). */
const rawVersion = (orgId: string, id: string) =>
  withTenant(db, orgId, (tx) => tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id } }))

describe('submitting', () => {
  it('stores the upload as a pending draft and enqueues one job; reads never expose the bytes', async () => {
    const admin = await adminWithOrg()
    const before = queue.of(ingestVersionJob.name).length
    const { documentId, versionId } = await submitDocument(
      admin.ctx,
      { title: 'Convenio' },
      fields,
      { kind: 'PDF', data: pdfBytes },
    )
    const sent = queue.of(ingestVersionJob.name)
    expect(sent.length).toBe(before + 1)
    expect(sent.at(-1)).toMatchObject({
      payload: { versionId },
      options: {
        organizationId: admin.organization.id,
        idempotencyKey: `knowledge-version:${versionId}`,
      },
    })
    const raw = await rawVersion(admin.organization.id, versionId)
    expect(raw).toMatchObject({
      status: 'DRAFT',
      requestedStatus: 'CURRENT',
      ingestionStatus: 'PENDING',
      sourceKind: 'PDF',
    })
    expect(raw.sourceData).not.toBeNull()
    const read = (await getDocument(admin.ctx, documentId)).versions[0]!
    expect(read).not.toHaveProperty('sourceData')
    expect(
      (await listDocuments(admin.ctx))
        .flatMap((d) => d.versions)
        .every((v) => !('sourceData' in v)),
    ).toBe(true)
  })

  it('refuses what is not valid, and to anyone but an administrator', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const before = queue.jobs.length
    for (const [source, detail] of [
      [{ kind: 'PDF', data: enc('not a pdf') }, 'NOT_A_PDF'],
      [{ kind: 'PDF', data: new Uint8Array() }, 'SOURCE_EMPTY'],
      [{ kind: 'TEXT', data: new Uint8Array([0xff, 0xfe, 0x00]) }, 'NOT_UTF8_TEXT'],
      [{ kind: 'WEB', url: 'ftp://example.org/x' }, 'URL_NOT_HTTP'],
      [{ kind: 'WEB', url: 'https://user:pw@example.org/x' }, 'URL_HAS_CREDENTIALS'],
    ] as const) {
      expect(await codeOf(submitDocument(admin.ctx, { title: 'X' }, fields, source))).toEqual({
        code: 'VALIDATION_FAILED',
        detail,
      })
    }
    expect(
      await codeOf(
        submitDocument(luis.ctx, { title: 'X' }, fields, { kind: 'PDF', data: pdfBytes }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' })
    expect(queue.jobs.length).toBe(before)
    // (GLOBAL documents of other tests are readable too: only the organization's own count.)
    expect(
      (await listDocuments(admin.ctx)).filter((d) => d.organizationId === admin.organization.id),
    ).toEqual([])
  })

  it('a new version of someone else’s (or a GLOBAL) document does not exist', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const { documentId } = await submitDocument(a.ctx, { title: 'De A' }, fields, {
      kind: 'PDF',
      data: pdfBytes,
    })
    expect(
      await codeOf(submitVersion(b.ctx, documentId, fields, { kind: 'PDF', data: pdfBytes })),
    ).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('the ingestion job', () => {
  it('extracts, chunks, embeds and stores; the version gets its status and the bytes are gone', async () => {
    const admin = await adminWithOrg()
    const { versionId } = await submitDocument(admin.ctx, { title: 'Convenio' }, fields, {
      kind: 'PDF',
      data: pdfBytes,
    })
    await ingestVersion(deps, admin.organization.id, versionId, first)
    const v = await rawVersion(admin.organization.id, versionId)
    expect(v).toMatchObject({ ingestionStatus: 'READY', status: 'CURRENT', ingestionError: null })
    expect(v).toMatchObject({ sourceData: null, sourceUrl: null, sourceKind: null })
    const chunks = await listChunks(admin.ctx, versionId)
    expect(chunks.map((c) => c.label)).toEqual(['Artículo 1'])
    expect(chunks[0]?.content).toContain('baja por incapacidad')
  })

  it('a pending upload does not supersede the CURRENT version until it is ready', async () => {
    const admin = await adminWithOrg()
    const doc = await createDocument(admin.ctx, { title: 'Norma' })
    const old = await createDocumentVersion(admin.ctx, embeddings, doc.id, {
      version: '2025',
      status: 'CURRENT',
      effectiveFrom: '2025-01-01',
      chunks: [{ ordinal: 0, content: 'Texto antiguo' }],
    })
    const { versionId } = await submitVersion(admin.ctx, doc.id, fields, {
      kind: 'TEXT',
      data: enc('Texto nuevo'),
    })
    const status = async () =>
      Object.fromEntries(
        (await getDocument(admin.ctx, doc.id)).versions.map((v) => [v.version, v.status]),
      )
    expect(await status()).toEqual({ '2025': 'CURRENT', '2026': 'DRAFT' })
    await ingestVersion(deps, admin.organization.id, versionId, first)
    expect(await status()).toEqual({ '2025': 'SUPERSEDED', '2026': 'CURRENT' })
    expect((await listChunks(admin.ctx, old.id)).length).toBe(1)
  })

  it('is idempotent: running it again changes nothing and duplicates no chunk', async () => {
    const admin = await adminWithOrg()
    const { versionId } = await submitDocument(admin.ctx, { title: 'N' }, fields, {
      kind: 'TEXT',
      data: enc('Artículo 1\nUno.\n\nArtículo 2\nDos.'),
    })
    await ingestVersion(deps, admin.organization.id, versionId, first)
    const count = (await listChunks(admin.ctx, versionId)).length
    await ingestVersion(deps, admin.organization.id, versionId, first)
    expect((await listChunks(admin.ctx, versionId)).length).toBe(count)
  })

  it('a web page is read through the extractor with the submitted URL', async () => {
    const admin = await adminWithOrg()
    const { documentId, versionId } = await submitDocument(admin.ctx, { title: 'Web' }, fields, {
      kind: 'WEB',
      url: 'https://www.boe.es/ley',
    })
    expect((await getDocument(admin.ctx, documentId)).sourceType).toBe('WEB')
    await ingestVersion(deps, admin.organization.id, versionId, first)
    const text = (await listChunks(admin.ctx, versionId)).map((c) => c.content).join('\n')
    expect(text).toContain('https://www.boe.es/ley')
  })

  it('no embedding provider, an empty document or an oversized one fail at once, with a code', async () => {
    const admin = await adminWithOrg()
    const submit = async (text: string) =>
      (await submitDocument(admin.ctx, { title: 'N' }, fields, { kind: 'TEXT', data: enc(text) }))
        .versionId
    const code = async (id: string) => {
      const v = await rawVersion(admin.organization.id, id)
      expect(v.sourceData).toBeNull() // whatever the outcome, the upload is not kept
      return [v.ingestionStatus, v.ingestionError]
    }
    const noProvider = await submit('Texto')
    await ingestVersion({ ...deps, embeddings: null }, admin.organization.id, noProvider, first)
    expect(await code(noProvider)).toEqual(['FAILED', 'EMBEDDINGS_NOT_CONFIGURED'])

    const blank = await submit('   \n  ')
    await ingestVersion(deps, admin.organization.id, blank, first)
    expect(await code(blank)).toEqual(['FAILED', 'EMPTY_DOCUMENT'])

    const huge = await submit('x'.repeat(1_900_000)) // under the 2 MB upload limit, over the extracted one
    await ingestVersion(deps, admin.organization.id, huge, first)
    expect(await code(huge)).toEqual(['FAILED', 'TOO_LONG'])
  })

  it('a failing extraction is retried and only the last attempt marks it FAILED', async () => {
    const admin = await adminWithOrg()
    const { versionId } = await submitDocument(admin.ctx, { title: 'N' }, fields, {
      kind: 'PDF',
      data: pdfBytes,
    })
    const broken = {
      ...deps,
      extractor: { ...extractor, extractPdf: () => Promise.reject(new Error('corrupt')) },
    }
    await expect(ingestVersion(broken, admin.organization.id, versionId, first)).rejects.toThrow()
    expect((await rawVersion(admin.organization.id, versionId)).ingestionStatus).toBe('PROCESSING')
    await ingestVersion(broken, admin.organization.id, versionId, last)
    const v = await rawVersion(admin.organization.id, versionId)
    expect(v).toMatchObject({
      ingestionStatus: 'FAILED',
      ingestionError: 'EXTRACTION_FAILED',
      status: 'DRAFT',
    })
    expect(v.sourceData).toBeNull()
    // The stored error is a code: the provider's message never reaches the row.
    expect(JSON.stringify(v)).not.toContain('corrupt')
  })
})

describe('GLOBAL knowledge, by the operator', () => {
  it('is written with the platform role, read by every organization and writable by none', async () => {
    const url = new URL(process.env.DATABASE_URL!)
    url.username = 'app_platform'
    url.password = process.env.APP_PLATFORM_PASSWORD ?? 'platform'
    const platform = createDb({ connectionString: url.toString(), max: 2 })
    try {
      const done = await ingestGlobalDocument(
        { db: platform, embeddings, extractor },
        {
          document: { title: 'Estatuto de los Trabajadores', jurisdiction: 'ES' },
          version: { version: '2015', effectiveFrom: '2015-10-24' },
          source: { kind: 'TEXT', text: 'Artículo 1\nÁmbito de aplicación.' },
        },
      )
      expect(done.chunks).toBe(1)
      const a = await adminWithOrg()
      const b = await adminWithOrg()
      for (const org of [a, b]) {
        const doc = await getDocument(org.ctx, done.documentId)
        expect(doc).toMatchObject({ visibility: 'GLOBAL', organizationId: null })
        expect(doc.versions[0]).toMatchObject({ status: 'CURRENT', ingestionStatus: 'READY' })
        expect((await listChunks(org.ctx, done.versionId)).length).toBe(1)
      }
      expect(
        await codeOf(
          submitVersion(a.ctx, done.documentId, fields, { kind: 'TEXT', data: enc('x') }),
        ),
      ).toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      await platform.$disconnect()
    }
  })

  it('an organization’s own connection cannot write GLOBAL knowledge', async () => {
    await expect(
      ingestGlobalDocument(
        { db, embeddings, extractor },
        {
          document: { title: 'Falsa' },
          version: fields,
          source: { kind: 'TEXT', text: 'Artículo 1\nTexto.' },
        },
      ),
    ).rejects.toThrow(/row-level security/i)
  })
})
