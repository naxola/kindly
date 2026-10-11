/**
 * Pure logic about files members send in a conversation (UI-10c). No I/O and
 * no `server-only` guard, so it unit-tests directly.
 *
 * **Kindly never stores the file** (`docs/ui/CONVERSATION_WORKSPACE.md`
 * §5.2). A message keeps only a small descriptor — what it is and the
 * provider's handle (`mediaId`) — and "Descargar" streams the bytes from the
 * provider to the delegate's browser without writing them anywhere.
 */
export type AttachmentKind = "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "STICKER";

export const ATTACHMENT_KINDS: readonly AttachmentKind[] = ["IMAGE", "DOCUMENT", "AUDIO", "VIDEO", "STICKER"];

export interface MessageAttachment {
  kind: AttachmentKind;
  /** The provider's handle for the file (WhatsApp `media_id`). Never sent to the browser. */
  mediaId: string;
  mimeType: string | null;
  /** Only documents carry one. */
  filename: string | null;
}

export const ATTACHMENT_KIND_LABELS: Record<AttachmentKind, string> = {
  IMAGE: "Imagen",
  DOCUMENT: "Documento",
  AUDIO: "Audio",
  VIDEO: "Vídeo",
  STICKER: "Sticker",
};

/** Largest file the download proxy will pass through. */
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
/** Downloads one member can start per minute (counted from the activity log). */
export const MEDIA_DOWNLOADS_PER_MINUTE = 20;

/** What the message list and notifications show for a message that has a file. */
export function attachmentPlaceholder(attachment: Pick<MessageAttachment, "kind" | "filename">): string {
  const label = ATTACHMENT_KIND_LABELS[attachment.kind];
  return attachment.kind === "DOCUMENT" && attachment.filename ? `[${label}: ${attachment.filename}]` : `[${label}]`;
}

/** A message's text: the sender's caption when there is one, else the placeholder. */
export function bodyForAttachment(caption: string | null | undefined, attachment: MessageAttachment): string {
  const trimmed = caption?.trim();
  return trimmed ? trimmed : attachmentPlaceholder(attachment);
}

/** Until when the provider still serves the file; null when the channel cannot download at all. */
export function mediaAvailableUntil(receivedAt: Date, days: number | null): Date | null {
  return days === null ? null : new Date(receivedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isMediaExpired(receivedAt: Date, days: number | null, now: Date = new Date()): boolean {
  const until = mediaAvailableUntil(receivedAt, days);
  return until === null || now.getTime() >= until.getTime();
}

const KIND_FALLBACK_NAMES: Record<AttachmentKind, string> = {
  IMAGE: "imagen",
  DOCUMENT: "documento",
  AUDIO: "audio",
  VIDEO: "video",
  STICKER: "sticker",
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
};

/** A mime type that is safe to echo in a header, or the generic binary one. */
export function safeContentType(mime: string | null): string {
  return mime && /^[a-z]+\/[a-z0-9][a-z0-9.+-]*$/i.test(mime) ? mime.toLowerCase() : "application/octet-stream";
}

/** A file name safe for `Content-Disposition`: no path parts, control characters or quotes. */
export function safeDownloadName(attachment: Pick<MessageAttachment, "kind" | "filename" | "mimeType">): string {
  const cleaned = (attachment.filename ?? "")
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\./, "")
    .trim()
    .slice(0, 120);
  if (cleaned) return cleaned;
  const extension = EXTENSIONS[safeContentType(attachment.mimeType)];
  return extension ? `${KIND_FALLBACK_NAMES[attachment.kind]}.${extension}` : KIND_FALLBACK_NAMES[attachment.kind];
}

/**
 * The notice a delegate can insert in the composer and send to a member who is
 * about to share documents (`docs/ui/CONVERSATION_WORKSPACE.md` §5.2). It must
 * stay **truthful**: Kindly does not keep the file, but with coexistence the
 * file stays in the delegate's own WhatsApp and the provider holds it for a
 * while — so it promises nothing about places Kindly does not control.
 * Proposed wording; legal review and the privacy policy come before production.
 */
export const DOCUMENTS_NOTICE_TEXT =
  "Kindly no guarda los documentos que envías: tu delegado los descarga para tramitarlos y no quedan almacenados en la plataforma.";
