/**
 * Files in conversations (ported from the previous app, UI-10c; docs/DECISIONS.md 2026-11-16).
 * Pure: no I/O.
 *
 * **Kindly never stores the file** (product principle: Kindly does not keep the affiliates' files).
 * A message keeps only a small descriptor — what it is and the provider's handle (`mediaId`) — and
 * the download streams the bytes from the provider to the person's browser without writing them
 * anywhere.
 */
export type AttachmentKind = 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO' | 'STICKER'

export const ATTACHMENT_KINDS: readonly AttachmentKind[] = [
  'IMAGE',
  'DOCUMENT',
  'AUDIO',
  'VIDEO',
  'STICKER',
]

export interface MessageAttachment {
  kind: AttachmentKind
  /** The provider's handle for the file (WhatsApp `media_id`). Never sent to the browser. */
  mediaId: string
  mimeType: string | null
  /** Only documents carry one. */
  filename: string | null
}

/** Largest file the download proxy passes through. */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024
/** Downloads one member can start per minute. */
export const MEDIA_DOWNLOADS_PER_MINUTE = 20

const PLACEHOLDER_LABELS: Record<AttachmentKind, string> = {
  IMAGE: 'Imagen',
  DOCUMENT: 'Documento',
  AUDIO: 'Audio',
  VIDEO: 'Vídeo',
  STICKER: 'Sticker',
}

/**
 * What the message text says for a message that is only a file. Stored as the message body (inbox
 * previews and search read it), so it is a fixed, language-neutral-enough marker.
 */
export function attachmentPlaceholder(a: Pick<MessageAttachment, 'kind' | 'filename'>): string {
  const label = PLACEHOLDER_LABELS[a.kind]
  return a.kind === 'DOCUMENT' && a.filename ? `[${label}: ${a.filename}]` : `[${label}]`
}

/** A message's text: the sender's caption when there is one, else the placeholder. */
export function bodyForAttachment(
  caption: string | null | undefined,
  attachment: MessageAttachment,
): string {
  const trimmed = caption?.trim()
  return trimmed ? trimmed : attachmentPlaceholder(attachment)
}

/** Whether the provider no longer serves the file (always true when the channel cannot download). */
export function isMediaExpired(receivedAt: Date, days: number | null, now = new Date()): boolean {
  if (days === null) return true
  return now.getTime() >= receivedAt.getTime() + days * 24 * 60 * 60 * 1000
}

/** Reads a descriptor stored in `messages.attachment` (JSON), or null if it is not one. */
export function readAttachment(raw: unknown): MessageAttachment | null {
  const v = raw as Partial<Record<keyof MessageAttachment, unknown>> | null | undefined
  if (!v || typeof v.mediaId !== 'string' || !ATTACHMENT_KINDS.includes(v.kind as AttachmentKind)) {
    return null
  }
  return {
    kind: v.kind as AttachmentKind,
    mediaId: v.mediaId,
    mimeType: typeof v.mimeType === 'string' ? v.mimeType : null,
    filename: typeof v.filename === 'string' ? v.filename : null,
  }
}

const FALLBACK_NAMES: Record<AttachmentKind, string> = {
  IMAGE: 'imagen',
  DOCUMENT: 'documento',
  AUDIO: 'audio',
  VIDEO: 'video',
  STICKER: 'sticker',
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'video/mp4': 'mp4',
}

/** A MIME type safe to echo in a header, or the generic binary one. */
export function safeContentType(mime: string | null): string {
  return mime && /^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/i.test(mime)
    ? mime.toLowerCase()
    : 'application/octet-stream'
}

/** A file name safe for `Content-Disposition`: no path parts, control characters or quotes. */
export function safeDownloadName(
  a: Pick<MessageAttachment, 'kind' | 'filename' | 'mimeType'>,
): string {
  const cleaned = (a.filename ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\./, '')
    .trim()
    .slice(0, 120)
  if (cleaned) return cleaned
  const extension = EXTENSIONS[safeContentType(a.mimeType)]
  return extension ? `${FALLBACK_NAMES[a.kind]}.${extension}` : FALLBACK_NAMES[a.kind]
}

/** The provider no longer serves the file (expired or removed). Recognized by name. */
export class MediaUnavailableError extends Error {
  constructor(message = 'The provider no longer serves this file.') {
    super(message)
    this.name = 'MediaUnavailableError'
  }
}

export class MediaTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`The file exceeds the ${maxBytes}-byte limit.`)
    this.name = 'MediaTooLargeError'
  }
}

/**
 * Caps a stream being passed through: past `maxBytes` it errors instead of delivering the rest.
 * Nothing is buffered or written: each chunk is forwarded as it arrives.
 */
export function limitStream(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let seen = 0
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength
        if (seen > maxBytes) {
          controller.error(new MediaTooLargeError(maxBytes))
          return
        }
        controller.enqueue(chunk)
      },
    }),
  )
}
