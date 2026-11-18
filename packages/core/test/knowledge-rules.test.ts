import { describe, expect, it } from 'vitest'
import {
  MAX_PDF_BYTES,
  MAX_TEXT_BYTES,
  validatePdf,
  validateTextFile,
  validateWebUrl,
} from '../src/index.ts'

const enc = (s: string) => new TextEncoder().encode(s)

describe('validatePdf', () => {
  it('accepts a file that starts like a PDF, even with junk before the header', () => {
    expect(validatePdf(enc('%PDF-1.7 ...')).ok).toBe(true)
    expect(validatePdf(enc('\n\n  %PDF-1.4 ...')).ok).toBe(true)
  })
  it('judges by content, not by name: anything else is refused', () => {
    expect(validatePdf(enc('<html>no soy pdf</html>'))).toEqual({ ok: false, code: 'NOT_A_PDF' })
    expect(validatePdf(enc(`${'x'.repeat(2000)}%PDF-`))).toEqual({ ok: false, code: 'NOT_A_PDF' }) // header beyond 1 KiB
  })
  it('refuses empty and oversized files', () => {
    expect(validatePdf(new Uint8Array())).toEqual({ ok: false, code: 'SOURCE_EMPTY' })
    expect(validatePdf(new Uint8Array(MAX_PDF_BYTES + 1))).toEqual({
      ok: false,
      code: 'PDF_TOO_LARGE',
    })
  })
})

describe('validateTextFile', () => {
  it('decodes UTF-8', () => {
    expect(validateTextFile(enc('Artículo 1: ñandú'))).toEqual({
      ok: true,
      value: 'Artículo 1: ñandú',
    })
  })
  it('refuses binary content, other encodings, empty and oversized files', () => {
    expect(validateTextFile(new Uint8Array([0x68, 0x00, 0x69]))).toEqual({
      ok: false,
      code: 'NOT_UTF8_TEXT',
    })
    expect(validateTextFile(new Uint8Array([0xff, 0xfe, 0x41]))).toEqual({
      ok: false,
      code: 'NOT_UTF8_TEXT',
    })
    expect(validateTextFile(new Uint8Array())).toEqual({ ok: false, code: 'SOURCE_EMPTY' })
    expect(validateTextFile(new Uint8Array(MAX_TEXT_BYTES + 1).fill(0x61))).toEqual({
      ok: false,
      code: 'TEXT_TOO_LARGE',
    })
  })
})

describe('validateWebUrl', () => {
  it('accepts http(s) and normalizes', () => {
    expect(validateWebUrl(' https://www.boe.es/ley ')).toEqual({
      ok: true,
      value: 'https://www.boe.es/ley',
    })
    expect(validateWebUrl('http://example.org').ok).toBe(true)
  })
  it('refuses other schemes, credentials and nonsense', () => {
    expect(validateWebUrl('ftp://x.es')).toEqual({ ok: false, code: 'URL_NOT_HTTP' })
    expect(validateWebUrl('file:///etc/passwd')).toEqual({ ok: false, code: 'URL_NOT_HTTP' })
    expect(validateWebUrl('https://user:pw@x.es')).toEqual({
      ok: false,
      code: 'URL_HAS_CREDENTIALS',
    })
    expect(validateWebUrl('no es una url')).toEqual({ ok: false, code: 'INVALID_URL' })
  })
})
