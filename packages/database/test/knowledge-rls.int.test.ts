import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, newId, withTenant, type Db, type TenantTx } from '../src/index.ts'
import pg from 'pg'

/**
 * Knowledge RLS (D8): everyone reads GLOBAL plus their own; a tenant writes only its own; GLOBAL
 * knowledge is written only by the platform role (BYPASSRLS), from the operator script.
 */

let db: Db
let platform: pg.Client
let orgA: string
let orgB: string
let globalDoc: string

const VEC = `[${new Array(1536).fill(0).join(',')}]`

async function org(name: string) {
  const id = newId()
  await withTenant(db, id, (tx) =>
    tx.organization.create({ data: { id, name, slug: `${name}-${id}` } }),
  )
  return id
}

/** A document of `orgId` (null = GLOBAL) with one version and one chunk, via the given tenant tx. */
async function seed(tx: TenantTx, orgId: string, title: string) {
  const doc = await tx.knowledgeDocument.create({
    data: { organizationId: orgId, visibility: 'ORGANIZATION', title },
  })
  const version = await tx.knowledgeDocumentVersion.create({
    data: {
      organizationId: orgId,
      documentId: doc.id,
      version: '1',
      status: 'CURRENT',
      effectiveFrom: new Date('2026-01-01'),
    },
  })
  const chunkId = newId()
  await tx.$executeRaw`INSERT INTO knowledge_chunks
    (id, organization_id, visibility, document_id, document_version_id, ordinal, content, embedding)
    VALUES (${chunkId}::uuid, ${orgId}::uuid, 'ORGANIZATION', ${doc.id}::uuid, ${version.id}::uuid, 0,
            ${title}, ${VEC}::vector)`
  return { doc, version, chunkId }
}

beforeAll(async () => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  const url = new URL(process.env.DATABASE_URL!)
  url.username = 'app_platform'
  url.password = process.env.APP_PLATFORM_PASSWORD ?? 'platform'
  platform = new pg.Client({ connectionString: url.toString() })
  await platform.connect()
  orgA = await org('know-a')
  orgB = await org('know-b')
  // GLOBAL knowledge: only the platform role can create it.
  globalDoc = newId()
  const versionId = newId()
  await platform.query(
    `INSERT INTO knowledge_documents (id, organization_id, visibility, title, updated_at)
     VALUES ($1, NULL, 'GLOBAL', 'Estatuto de los Trabajadores', now())`,
    [globalDoc],
  )
  await platform.query(
    `INSERT INTO knowledge_document_versions (id, organization_id, document_id, version, status, effective_from)
     VALUES ($1, NULL, $2, '2015', 'CURRENT', '2015-10-24')`,
    [versionId, globalDoc],
  )
  await platform.query(
    `INSERT INTO knowledge_chunks (id, organization_id, visibility, document_id, document_version_id, ordinal, content, embedding)
     VALUES ($1, NULL, 'GLOBAL', $2, $3, 0, 'Artículo 1', $4::vector)`,
    [newId(), globalDoc, versionId, VEC],
  )
})

afterAll(async () => {
  await platform.end()
  await db.$disconnect()
})

describe('reading', () => {
  it('an organization reads GLOBAL knowledge and its own, never another one’s', async () => {
    await withTenant(db, orgA, (tx) => seed(tx, orgA, 'Privado de A'))
    await withTenant(db, orgB, (tx) => seed(tx, orgB, 'Privado de B'))
    for (const [org, mine, theirs] of [
      [orgA, 'Privado de A', 'Privado de B'],
      [orgB, 'Privado de B', 'Privado de A'],
    ] as const) {
      await withTenant(db, org, async (tx) => {
        const titles = (await tx.knowledgeDocument.findMany()).map((d) => d.title)
        expect(titles).toContain('Estatuto de los Trabajadores')
        expect(titles).toContain(mine)
        expect(titles).not.toContain(theirs)
        // Versions and chunks follow the same rule.
        const contents = (
          await tx.$queryRaw<{ content: string }[]>`SELECT content FROM knowledge_chunks`
        ).map((c) => c.content)
        expect(contents).toContain('Artículo 1')
        expect(contents).toContain(mine)
        expect(contents).not.toContain(theirs)
        // (Other tests leave GLOBAL documents behind: count what is the organization's, and that
        // nothing belongs to anybody else.)
        const versions = await tx.knowledgeDocumentVersion.findMany()
        expect(versions.some((v) => v.organizationId === null)).toBe(true)
        expect(versions.filter((v) => v.organizationId === org)).toHaveLength(1)
        expect(versions.filter((v) => v.organizationId && v.organizationId !== org)).toEqual([])
      })
    }
  })

  it('without tenant context nothing private is visible (only GLOBAL, if anything)', async () => {
    const rows = await db.knowledgeDocument.findMany()
    expect(rows.every((d) => d.organizationId === null)).toBe(true)
  })
})

describe('writing', () => {
  it('a tenant cannot create GLOBAL knowledge, nor knowledge for another organization', async () => {
    await expect(
      withTenant(db, orgA, (tx) =>
        tx.knowledgeDocument.create({
          data: { organizationId: null, visibility: 'GLOBAL', title: 'Falsa norma' },
        }),
      ),
    ).rejects.toThrow(/row-level security/i)
    await expect(
      withTenant(db, orgA, (tx) =>
        tx.knowledgeDocument.create({
          data: { organizationId: orgB, visibility: 'ORGANIZATION', title: 'Intruso' },
        }),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('a tenant can neither change nor delete GLOBAL knowledge', async () => {
    await withTenant(db, orgA, async (tx) => {
      const changed = await tx.knowledgeDocument.updateMany({
        where: { id: globalDoc },
        data: { title: 'Manipulada' },
      })
      expect(changed.count).toBe(0)
      expect((await tx.knowledgeDocument.deleteMany({ where: { id: globalDoc } })).count).toBe(0)
    })
    const { rows } = await platform.query('SELECT title FROM knowledge_documents WHERE id = $1', [
      globalDoc,
    ])
    expect(rows[0].title).toBe('Estatuto de los Trabajadores')
  })

  it('the database refuses a GLOBAL document with an organization and the other way round', async () => {
    for (const [visibility, organizationId] of [
      ['GLOBAL', orgA],
      ['ORGANIZATION', null],
    ] as const) {
      await expect(
        platform.query(
          `INSERT INTO knowledge_documents (id, organization_id, visibility, title, updated_at)
           VALUES ($1, $2, $3::"KnowledgeVisibility", 'x', now())`,
          [newId(), organizationId, visibility],
        ),
      ).rejects.toThrow(/global_null_org/)
    }
  })

  it('at most one CURRENT version per document', async () => {
    await withTenant(db, orgA, async (tx) => {
      const { doc } = await seed(tx, orgA, 'Con versiones')
      await expect(
        tx.knowledgeDocumentVersion.create({
          data: {
            organizationId: orgA,
            documentId: doc.id,
            version: '2',
            status: 'CURRENT',
            effectiveFrom: new Date('2026-06-01'),
          },
        }),
      ).rejects.toThrow()
    })
  })

  it('deleting a GLOBAL document removes its versions and chunks, and no orphan can be created', async () => {
    const id = newId()
    const versionId = newId()
    await platform.query(
      `INSERT INTO knowledge_documents (id, organization_id, visibility, title, updated_at)
       VALUES ($1, NULL, 'GLOBAL', 'Efímera', now())`,
      [id],
    )
    await platform.query(
      `INSERT INTO knowledge_document_versions (id, organization_id, document_id, version, status, effective_from)
       VALUES ($1, NULL, $2, '1', 'CURRENT', '2020-01-01')`,
      [versionId, id],
    )
    await platform.query(
      `INSERT INTO knowledge_chunks (id, organization_id, visibility, document_id, document_version_id, ordinal, content, embedding)
       VALUES ($1, NULL, 'GLOBAL', $2, $3, 0, 'x', $4::vector)`,
      [newId(), id, versionId, VEC],
    )
    await platform.query('DELETE FROM knowledge_documents WHERE id = $1', [id])
    for (const table of ['knowledge_document_versions', 'knowledge_chunks']) {
      const { rows } = await platform.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE document_id = $1`,
        [id],
      )
      expect(rows[0].n).toBe(0)
    }
    await expect(
      platform.query(
        `INSERT INTO knowledge_document_versions (id, organization_id, document_id, version, status, effective_from)
         VALUES ($1, NULL, $2, '1', 'DRAFT', '2020-01-01')`,
        [newId(), newId()],
      ),
    ).rejects.toThrow(/foreign key/i)
  })
})
