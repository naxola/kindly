/**
 * What may be submitted to the knowledge base: type, size and content are validated (CLAUDE.md,
 * security), by magic bytes and not by the extension. Pure, so it unit-tests directly. Failures are
 * stable codes (`VALIDATION_FAILED` details); the words are the interface's.
 */

export const MAX_PDF_BYTES = 4 * 1024 * 1024
export const MAX_TEXT_BYTES = 2 * 1024 * 1024
/** Bound the embedding bill of a single upload. */
export const MAX_EXTRACTED_CHARS = 400_000
export const MAX_CHUNKS = 400

export type SourceCode =
  | 'SOURCE_EMPTY'
  | 'PDF_TOO_LARGE'
  | 'NOT_A_PDF'
  | 'TEXT_TOO_LARGE'
  | 'NOT_UTF8_TEXT'
  | 'INVALID_URL'
  | 'URL_NOT_HTTP'
  | 'URL_HAS_CREDENTIALS'

export type Validation<T> = { ok: true; value: T } | { ok: false; code: SourceCode }
const fail = (code: SourceCode): { ok: false; code: SourceCode } => ({ ok: false, code })

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // "%PDF-"

export function validatePdf(bytes: Uint8Array): Validation<Uint8Array> {
  if (bytes.length === 0) return fail('SOURCE_EMPTY')
  if (bytes.length > MAX_PDF_BYTES) return fail('PDF_TOO_LARGE')
  // Some producers put a few bytes before the header; the spec allows it within the first 1024.
  const head = bytes.subarray(0, 1024)
  const found = head.some((_, i) => PDF_MAGIC.every((byte, j) => head[i + j] === byte))
  return found ? { ok: true, value: bytes } : fail('NOT_A_PDF')
}

export function validateTextFile(bytes: Uint8Array): Validation<string> {
  if (bytes.length === 0) return fail('SOURCE_EMPTY')
  if (bytes.length > MAX_TEXT_BYTES) return fail('TEXT_TOO_LARGE')
  if (bytes.includes(0)) return fail('NOT_UTF8_TEXT')
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return fail('NOT_UTF8_TEXT')
  }
}

export function validateWebUrl(raw: string): Validation<string> {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return fail('INVALID_URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return fail('URL_NOT_HTTP')
  if (url.username || url.password) return fail('URL_HAS_CREDENTIALS')
  return { ok: true, value: url.href }
}
