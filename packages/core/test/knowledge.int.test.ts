import { newId, withTenant } from '@saas/database'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  createDocument,
  createDocumentVersion,
  FakeEmbeddingProvider,
  getDocument,
  listChunks,
  listDocuments,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember } from './helpers.ts'

let platform: pg.Client
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!)
  url.username = 'app_platform'
  url.password = process.env.APP_PLATFORM_PASSWORD ?? 'platform'
  platform = new pg.Client({ connectionString: url.toString() })
  await platform.connect()
})
afterAll(async () => {
  await platform.end()
  await db.$disconnect()
})

const fake = new FakeEmbeddingProvider()
const chunks = [
  {
    ordinal: 0,
    level: 'ARTICLE' as const,
    label: 'Artículo 1',
    content: 'La baja por incapacidad temporal',
  },
  {
    ordinal: 1,
    level: 'ARTICLE' as const,
    label: 'Artículo 2',
    content: 'El permiso de maternidad y paternidad',
  },
]
const v1 = { version: '2024', status: 'CURRENT' as const, effectiveFrom: '2024-01-01', chunks }

describe('writing and reading', () => {
  it('an administrator creates a document and a version; chunks are embedded and read in order', async () => {
    const admin = await adminWithOrg()
    const doc = await createDocument(admin.ctx, { title: ' Convenio ', sourceType: 'MANUAL' })
    expect(doc).toMatchObject({
      title: 'Convenio',
      visibility: 'ORGANIZATION',
      organizationId: admin.organization.id,
    })
    const before = fake.requests.length
    const version = await createDocumentVersion(admin.ctx, fake, doc.id, v1)
    expect(fake.requests.length).toBe(before + 1)
    expect(fake.requests.at(-1)).toEqual(chunks.map((c) => c.content))
    expect(version).toMatchObject({ status: 'CURRENT', ingestionStatus: 'READY' })

    const read = await listChunks(admin.ctx, version.id)
    expect(read.map((c) => c.label)).toEqual(['Artículo 1', 'Artículo 2'])
    // The vector is really stored, with the expected size, and tenancy comes from the document.
    const rows = await withTenant(
      db,
      admin.organization.id,
      (tx) =>
        tx.$queryRaw<{ dims: number; organization_id: string; visibility: string }[]>`
        SELECT vector_dims(embedding) AS dims, organization_id, visibility::text AS visibility
        FROM knowledge_chunks WHERE document_version_id = ${version.id}::uuid`,
    )
    expect(rows.map((r) => r.dims)).toEqual([1536, 1536])
    expect(
      rows.every(
        (r) => r.organization_id === admin.organization.id && r.visibility === 'ORGANIZATION',
      ),
    ).toBe(true)
    const full = await getDocument(admin.ctx, doc.id)
    expect(full.versions).toHaveLength(1)
    expect((await listDocuments(admin.ctx)).map((d) => d.id)).toContain(doc.id)
  })

  it('a new CURRENT version supersedes the previous one', async () => {
    const admin = await adminWithOrg()
    const doc = await createDocument(admin.ctx, { title: 'Norma' })
    await createDocumentVersion(admin.ctx, fake, doc.id, {
      ...v1,
      version: '2020',
      effectiveFrom: '2020-01-01',
    })
    await createDocumentVersion(admin.ctx, fake, doc.id, { ...v1, version: '2024' })
    const versions = (await getDocument(admin.ctx, doc.id)).versions
    expect(Object.fromEntries(versions.map((v) => [v.version, v.status]))).toEqual({
      '2020': 'SUPERSEDED',
      '2024': 'CURRENT',
    })
  })

  it('validates the input: dates, empty chunks, and the provider’s dimensions', async () => {
    const admin = await adminWithOrg()
    const doc = await createDocument(admin.ctx, { title: 'Norma' })
    await expect(
      createDocumentVersion(admin.ctx, fake, doc.id, { ...v1, effectiveUntil: '2023-01-01' }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      createDocumentVersion(admin.ctx, fake, doc.id, {
        ...v1,
        chunks: [{ ordinal: 0, content: '  ' }],
      }),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      createDocumentVersion(admin.ctx, new FakeEmbeddingProvider(8), doc.id, v1),
    ).rejects.toThrow(/dimensions/)
    expect((await getDocument(admin.ctx, doc.id)).versions).toEqual([])
  })

  it('a failed embedding stores nothing', async () => {
    const admin = await adminWithOrg()
    const doc = await createDocument(admin.ctx, { title: 'Norma' })
    const broken = {
      id: 'broken',
      dimensions: 1536,
      embed: () => Promise.reject(new Error('provider down')),
    }
    await expect(createDocumentVersion(admin.ctx, broken, doc.id, v1)).rejects.toThrow(
      'provider down',
    )
    expect((await getDocument(admin.ctx, doc.id)).versions).toEqual([])
  })
})

describe('who can do what', () => {
  it('a delegate reads the organization’s knowledge but cannot write it', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const doc = await createDocument(admin.ctx, { title: 'Interno' })
    expect((await listDocuments(luis.ctx)).map((d) => d.id)).toContain(doc.id)
    expect(await codeOf(createDocument(luis.ctx, { title: 'X' }))).toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(await codeOf(createDocumentVersion(luis.ctx, fake, doc.id, v1))).toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('one organization never sees, reads the chunks of or adds to another one’s knowledge', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const doc = await createDocument(a.ctx, { title: 'Privado de A' })
    const version = await createDocumentVersion(a.ctx, fake, doc.id, v1)
    expect((await listDocuments(b.ctx)).map((d) => d.id)).not.toContain(doc.id)
    expect(await codeOf(getDocument(b.ctx, doc.id))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await codeOf(listChunks(b.ctx, version.id))).toMatchObject({ code: 'NOT_FOUND' })
    expect(await codeOf(createDocumentVersion(b.ctx, fake, doc.id, v1))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('GLOBAL knowledge is readable by every organization and writable by none', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const id = newId()
    await platform.query(
      `INSERT INTO knowledge_documents (id, organization_id, visibility, title, updated_at)
       VALUES ($1, NULL, 'GLOBAL', 'Ley pública', now())`,
      [id],
    )
    for (const org of [a, b]) {
      expect((await getDocument(org.ctx, id)).title).toBe('Ley pública')
      expect((await listDocuments(org.ctx)).map((d) => d.id)).toContain(id)
    }
    expect(await codeOf(createDocumentVersion(a.ctx, fake, id, v1))).toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})
