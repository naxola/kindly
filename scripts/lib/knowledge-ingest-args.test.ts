import { describe, expect, it } from 'vitest'
import { parseIngestArgs } from './knowledge-ingest-args.ts'

const BASE = [
  '--title',
  'Ley de Extranjería',
  '--version',
  '1.0',
  '--effective-from',
  '2024-01-01',
  '--pdf',
  './ley.pdf',
]

describe('parseIngestArgs', () => {
  it('parses a minimal new GLOBAL document', () => {
    expect(parseIngestArgs(BASE)).toMatchObject({
      documentId: null,
      title: 'Ley de Extranjería',
      version: '1.0',
      status: 'CURRENT',
      effectiveFrom: '2024-01-01',
      effectiveUntil: null,
      input: { type: 'PDF', location: './ley.pdf' },
      provider: 'openai',
    })
  })

  it('accepts the optional metadata and each kind of source', () => {
    const args = parseIngestArgs([
      ...BASE.slice(0, -2),
      '--url',
      'https://www.boe.es/ley',
      '--effective-until',
      '2030-12-31',
      '--source-note',
      'BOE núm. 5',
      '--jurisdiction',
      'ES',
      '--provider',
      'fake',
    ])
    expect(args).toMatchObject({
      input: { type: 'URL', url: 'https://www.boe.es/ley' },
      effectiveUntil: '2030-12-31',
      sourceNote: 'BOE núm. 5',
      jurisdiction: 'ES',
      provider: 'fake',
    })
    expect(parseIngestArgs([...BASE.slice(0, -2), '--text-file', './a.txt']).input).toEqual({
      type: 'TEXT_FILE',
      path: './a.txt',
    })
  })

  it('adds a version to an existing document, never together with a title', () => {
    const rest = BASE.slice(2)
    expect(parseIngestArgs(['--document-id', 'doc-1', ...rest]).documentId).toBe('doc-1')
    expect(() => parseIngestArgs(['--document-id', 'doc-1', ...BASE])).toThrow(/--title/)
    expect(() => parseIngestArgs(rest)).toThrow(/Missing --title/)
  })

  it('refuses what is missing, repeated, unknown or malformed', () => {
    const without = (flag: string) => {
      const i = BASE.indexOf(flag)
      return [...BASE.slice(0, i), ...BASE.slice(i + 2)]
    }
    expect(() => parseIngestArgs(without('--version'))).toThrow(/Missing --version/)
    expect(() => parseIngestArgs(without('--effective-from'))).toThrow(/Missing --effective-from/)
    expect(() => parseIngestArgs(without('--pdf'))).toThrow(/Exactly one of/)
    expect(() => parseIngestArgs([...BASE, '--url', 'https://x.es'])).toThrow(/Exactly one of/)
    expect(() => parseIngestArgs([...BASE, '--bogus', 'x'])).toThrow(/Unknown flag/)
    expect(() => parseIngestArgs([...BASE, '--title', 'otra'])).toThrow(/more than once/)
    expect(() => parseIngestArgs([...BASE, '--status'])).toThrow(/requires a value/)
    expect(() => parseIngestArgs([...BASE, '--status', 'REPEALED'])).toThrow(/CURRENT or DRAFT/)
    expect(() => parseIngestArgs([...BASE, '--provider', 'x'])).toThrow(/openai/)
    const badDate = BASE.map((x) => (x === '2024-01-01' ? '01/01/2024' : x))
    expect(() => parseIngestArgs(badDate)).toThrow(/YYYY-MM-DD/)
    expect(() => parseIngestArgs([...BASE, '--effective-until', 'mañana'])).toThrow(/YYYY-MM-DD/)
  })
})
