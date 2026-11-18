import { describe, expect, it } from 'vitest'
import {
  attachmentPlaceholder,
  bodyForAttachment,
  isMediaExpired,
  limitStream,
  readAttachment,
  safeContentType,
  safeDownloadName,
} from '../src/index.ts'

const doc = {
  kind: 'DOCUMENT' as const,
  mediaId: 'm1',
  mimeType: 'application/pdf',
  filename: 'baja.pdf',
}

describe('files in conversations (descriptor only)', () => {
  it('a message that is only a file reads as a placeholder; a caption wins', () => {
    expect(attachmentPlaceholder(doc)).toBe('[Documento: baja.pdf]')
    expect(attachmentPlaceholder({ kind: 'IMAGE', filename: null })).toBe('[Imagen]')
    expect(bodyForAttachment('  ', doc)).toBe('[Documento: baja.pdf]')
    expect(bodyForAttachment('Mi parte', doc)).toBe('Mi parte')
  })

  it('expires after the days the channel serves files, and always when it cannot download', () => {
    const at = new Date('2026-11-01T10:00:00Z')
    expect(isMediaExpired(at, 7, new Date('2026-11-08T09:59:59Z'))).toBe(false)
    expect(isMediaExpired(at, 7, new Date('2026-11-08T10:00:00Z'))).toBe(true)
    expect(isMediaExpired(at, null, at)).toBe(true)
  })

  it('reads a stored descriptor and rejects anything else', () => {
    expect(readAttachment(doc)).toEqual(doc)
    expect(readAttachment({ kind: 'EXE', mediaId: 'x' })).toBeNull()
    expect(readAttachment(null)).toBeNull()
  })

  it('only safe names and types reach the response headers', () => {
    expect(safeDownloadName({ ...doc, filename: '../../etc/"pass"\nwd' })).not.toMatch(/[/"\n]/)
    expect(safeDownloadName({ kind: 'IMAGE', filename: null, mimeType: 'image/jpeg' })).toBe(
      'imagen.jpg',
    )
    expect(safeContentType('text/html; charset=x')).toBe('application/octet-stream')
    expect(safeContentType('application/PDF')).toBe('application/pdf')
  })

  it('a passed-through stream errors past the limit instead of delivering the rest', async () => {
    const source = () =>
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(6))
          c.enqueue(new Uint8Array(6))
          c.close()
        },
      })
    expect((await new Response(limitStream(source(), 12)).arrayBuffer()).byteLength).toBe(12)
    await expect(new Response(limitStream(source(), 10)).arrayBuffer()).rejects.toMatchObject({
      name: 'MediaTooLargeError',
    })
  })
})
