import { createDb } from '@saas/database'
import { afterAll, describe, expect, it } from 'vitest'
import {
  createDocument,
  createDocumentVersion,
  FakeEmbeddingProvider,
  ingestGlobalDocument,
  searchKnowledge,
  type KnowledgeExtractor,
} from '../src/index.ts'
import { adminWithOrg, codeOf, db, joinMember } from './helpers.ts'

afterAll(async () => {
  await db.$disconnect()
})

const fake = new FakeEmbeddingProvider()
const extractor: KnowledgeExtractor = {
  extractPdf: () => Promise.resolve(''),
  fetchWebText: () => Promise.resolve(''),
}

/** A unique word per test so results of other tests (GLOBAL documents stay) never interfere. */
const word = () => `zeta${Math.random().toString(36).slice(2, 10)}`

async function publish(
  org: Awaited<ReturnType<typeof adminWithOrg>>,
  title: string,
  versions: {
    version: string
    status?: 'CURRENT' | 'SUPERSEDED' | 'DRAFT' | 'REPEALED' | 'HISTORICAL'
    from: string
    until?: string
    text: string
  }[],
  meta: { jurisdiction?: string; territory?: string; scope?: string } = {},
) {
  const doc = await createDocument(org.ctx, { title, ...meta })
  for (const v of versions) {
    await createDocumentVersion(org.ctx, fake, doc.id, {
      version: v.version,
      status: v.status ?? 'CURRENT',
      effectiveFrom: v.from,
      effectiveUntil: v.until ?? null,
      chunks: [{ ordinal: 0, level: 'ARTICLE', label: 'Artículo 1', content: v.text }],
    })
  }
  return doc
}

describe('searching', () => {
  it('returns what matches, with everything a citation needs', async () => {
    const admin = await adminWithOrg()
    const w = word()
    const doc = await publish(
      admin,
      'Convenio colectivo',
      [{ version: '2024', from: '2024-01-01', text: `La baja por ${w} se tramita en una semana.` }],
      { jurisdiction: 'ES' },
    )
    const [hit] = await searchKnowledge(admin.ctx, fake, { query: w })
    expect(hit).toMatchObject({
      documentId: doc.id,
      documentTitle: 'Convenio colectivo',
      visibility: 'ORGANIZATION',
      version: '2024',
      status: 'CURRENT',
      effectiveFrom: '2024-01-01',
      effectiveUntil: null,
      jurisdiction: 'ES',
      level: 'ARTICLE',
      label: 'Artículo 1',
    })
    expect(hit?.content).toContain(w)
    expect(hit?.score).toBeGreaterThan(0)
  })

  it('answers with the version applicable at the date asked, never a draft or a repealed one', async () => {
    const admin = await adminWithOrg()
    const w = word()
    await publish(admin, 'Norma', [
      {
        version: '2018',
        status: 'SUPERSEDED',
        from: '2018-01-01',
        until: '2023-12-31',
        text: `${w} antigua`,
      },
      { version: '2024', from: '2024-01-01', text: `${w} nueva` },
      { version: 'borrador', status: 'DRAFT', from: '2024-01-01', text: `${w} borrador` },
      {
        version: 'derogada',
        status: 'REPEALED',
        from: '2000-01-01',
        until: '2030-01-01',
        text: `${w} derogada`,
      },
    ])
    const at = async (atDate: string) =>
      (await searchKnowledge(admin.ctx, fake, { query: w, atDate })).map((r) => r.version)
    expect(await at('2026-06-01')).toEqual(['2024'])
    expect(await at('2020-06-01')).toEqual(['2018'])
    expect(await at('2010-01-01')).toEqual([])
  })

  it('filters by jurisdiction, territory and scope before ranking, as an equality', async () => {
    const admin = await adminWithOrg()
    const w = word()
    await publish(admin, 'Estatal', [{ version: '1', from: '2020-01-01', text: w }], {
      jurisdiction: 'ES',
      scope: 'laboral',
    })
    await publish(admin, 'Europea', [{ version: '1', from: '2020-01-01', text: w }], {
      jurisdiction: 'EU',
      scope: 'laboral',
    })
    const titles = async (f: object) =>
      (await searchKnowledge(admin.ctx, fake, { query: w, ...f }))
        .map((r) => r.documentTitle)
        // (the vector side may add unrelated GLOBAL rows when no filter narrows it)
        .filter((t) => t === 'Estatal' || t === 'Europea')
        .sort()
    expect(await titles({})).toEqual(['Estatal', 'Europea'])
    expect(await titles({ jurisdiction: 'es' })).toEqual(['Estatal'])
    expect(await titles({ jurisdiction: 'E' })).toEqual([]) // equality, not a prefix
    expect(await titles({ jurisdiction: '%' })).toEqual([]) // wildcards are literal
    expect(await titles({ scope: 'laboral', jurisdiction: 'EU' })).toEqual(['Europea'])
  })

  it('never returns another organization’s knowledge, but does return GLOBAL', async () => {
    const a = await adminWithOrg()
    const b = await adminWithOrg()
    const w = word()
    await publish(a, 'Privado de A', [{ version: '1', from: '2020-01-01', text: `${w} privado` }])
    expect(await searchKnowledge(b.ctx, fake, { query: w })).toEqual([])

    const url = new URL(process.env.DATABASE_URL!)
    url.username = 'app_platform'
    url.password = process.env.APP_PLATFORM_PASSWORD ?? 'platform'
    const platform = createDb({ connectionString: url.toString(), max: 2 })
    try {
      await ingestGlobalDocument(
        { db: platform, embeddings: fake, extractor },
        {
          document: { title: 'Ley pública' },
          version: { version: '1', effectiveFrom: '2020-01-01' },
          source: { kind: 'TEXT', text: `Artículo 1\n${w} público` },
        },
      )
    } finally {
      await platform.$disconnect()
    }
    for (const org of [a, b]) {
      const found = await searchKnowledge(org.ctx, fake, { query: w })
      expect(
        found.some((r) => r.visibility === 'GLOBAL' && r.documentTitle === 'Ley pública'),
      ).toBe(true)
      expect(found.every((r) => r.documentTitle !== 'Privado de B')).toBe(true)
    }
    expect(
      (await searchKnowledge(b.ctx, fake, { query: w })).map((r) => r.documentTitle),
    ).not.toContain('Privado de A')
  })

  it('finds by meaning when the words do not match (vector side), and says when it cannot', async () => {
    const admin = await adminWithOrg()
    const w = word()
    await publish(admin, 'Solo vectorial', [
      { version: '1', from: '2020-01-01', text: `permiso ${w} retribuido quince días` },
    ])
    // No full text match for this query (the words differ), but the fake embedding shares tokens
    // with the chunk: the semantic list still brings it, ranked by exact cosine distance.
    const hits = await searchKnowledge(admin.ctx, fake, { query: `retribuido ${w}x`, limit: 25 })
    expect(hits.some((r) => r.documentTitle === 'Solo vectorial')).toBe(true)
    expect(await codeOf(searchKnowledge(admin.ctx, null, { query: w }))).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'EMBEDDINGS_NOT_CONFIGURED',
    })
  })

  it('does not return unrelated text just because it is the nearest', async () => {
    const admin = await adminWithOrg()
    const w = word()
    await publish(admin, 'Otra cosa', [
      { version: '1', from: '2020-01-01', text: 'vacaciones anuales retribuidas' },
    ])
    // (A hashed bag of words can collide with a GLOBAL chunk left by another test: look only at ours.)
    const strict = await searchKnowledge(admin.ctx, fake, { query: w })
    expect(strict.map((r) => r.documentTitle)).not.toContain('Otra cosa')
    // With the floor lowered to zero it would come back: the floor is what keeps it out.
    const loose = await searchKnowledge(admin.ctx, fake, { query: w, minSimilarity: 0, limit: 25 })
    expect(loose.map((r) => r.documentTitle)).toContain('Otra cosa')
  })

  it('validates the query and is for anyone who can read', async () => {
    const admin = await adminWithOrg()
    const luis = await joinMember(admin, 'Luis')
    const w = word()
    await publish(admin, 'Interno', [{ version: '1', from: '2020-01-01', text: w }])
    const found = await searchKnowledge(luis.ctx, fake, { query: w })
    expect(found[0]?.documentTitle).toBe('Interno')
    await expect(searchKnowledge(admin.ctx, fake, { query: '  ' })).rejects.toThrow()
  })
})
