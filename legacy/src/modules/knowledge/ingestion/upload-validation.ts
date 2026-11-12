/**
 * Validation of what an ADMIN submits from the upload form (Fase 7f) — pure,
 * no DB/network, so it unit-tests directly. `CLAUDE.md` §5: type, size and
 * content of uploaded files are validated (magic bytes, not just the
 * extension). Messages are UI copy (Spanish), returned to the form.
 *
 * The PDF limit is 4 MB, not more: the file travels in the request body and
 * Vercel's serverless functions reject bodies over 4.5 MB before our code
 * runs, so a higher limit here would only fail later and more obscurely.
 */
import type { DocumentVersionStatus } from "@/modules/knowledge/schema";

export const MAX_PDF_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_BYTES = 2 * 1024 * 1024;
/** Bounds the embedding bill of a single upload. */
export const MAX_EXTRACTED_CHARS = 400_000;
export const MAX_CHUNKS = 400;

export type UploadOrigin = "PDF" | "TEXT" | "WEB";
export type UploadedSource =
  | { type: "PDF"; data: Uint8Array }
  | { type: "TEXT"; text: string }
  | { type: "WEB"; url: string };

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function validatePdf(size: number, bytes: Uint8Array): Validation<Uint8Array> {
  if (size === 0) {
    return fail("El archivo está vacío.");
  }
  if (size > MAX_PDF_BYTES) {
    return fail("El PDF supera el máximo de 4 MB.");
  }
  // Some producers prepend a few bytes of junk before the header; the spec allows it within the first 1024.
  const head = bytes.subarray(0, 1024);
  const found = head.some((_, i) => PDF_MAGIC.every((byte, j) => head[i + j] === byte));
  if (!found) {
    return fail("El archivo no es un PDF válido.");
  }
  return { ok: true, value: bytes };
}

export function validateTextFile(size: number, bytes: Uint8Array): Validation<string> {
  if (size === 0) {
    return fail("El archivo está vacío.");
  }
  if (size > MAX_TEXT_BYTES) {
    return fail("El archivo de texto supera el máximo de 2 MB.");
  }
  if (bytes.includes(0)) {
    return fail("El archivo no es un texto válido.");
  }
  try {
    return { ok: true, value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return fail("El archivo de texto debe estar codificado en UTF-8.");
  }
}

export function validateWebUrl(raw: string): Validation<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return fail("La dirección web no es válida.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail("La dirección web debe empezar por http:// o https://.");
  }
  if (url.username || url.password) {
    return fail("La dirección web no puede incluir usuario ni contraseña.");
  }
  return { ok: true, value: url.href };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(value: string): boolean {
  if (!DAY.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface VersionFields {
  version: string;
  status: Extract<DocumentVersionStatus, "CURRENT" | "DRAFT">;
  effectiveFrom: string;
  effectiveUntil: string | null;
  sourceNote: string | null;
  origin: UploadOrigin;
  /** Raw, unvalidated file/url — validated against `origin` by the caller. */
  file: File | null;
  url: string;
}

export interface DocumentFields {
  title: string;
  jurisdiction: string | null;
  territory: string | null;
  scope: string | null;
}

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => text(data, key) || null;

export function parseVersionFields(data: FormData): Validation<VersionFields> {
  const version = text(data, "version");
  if (!version) {
    return fail("Indica la versión.");
  }
  const effectiveFrom = text(data, "effectiveFrom");
  if (!isRealDay(effectiveFrom)) {
    return fail("Indica una fecha de entrada en vigor válida.");
  }
  const effectiveUntil = optional(data, "effectiveUntil");
  if (effectiveUntil !== null) {
    if (!isRealDay(effectiveUntil)) {
      return fail("La fecha de fin de vigencia no es válida.");
    }
    if (effectiveUntil < effectiveFrom) {
      return fail("La vigencia no puede terminar antes de empezar.");
    }
  }
  const status = text(data, "status") || "CURRENT";
  if (status !== "CURRENT" && status !== "DRAFT") {
    return fail("El estado de la versión no es válido.");
  }
  const origin = text(data, "origin");
  if (origin !== "PDF" && origin !== "TEXT" && origin !== "WEB") {
    return fail("Elige el origen del documento.");
  }
  const file = data.get("file");
  return {
    ok: true,
    value: {
      version,
      status,
      effectiveFrom,
      effectiveUntil,
      sourceNote: optional(data, "sourceNote"),
      origin,
      file: file instanceof File && file.size > 0 ? file : null,
      url: text(data, "url"),
    },
  };
}

export function parseDocumentFields(data: FormData): Validation<DocumentFields> {
  const title = text(data, "title");
  if (!title) {
    return fail("Indica el título del documento.");
  }
  return {
    ok: true,
    value: {
      title,
      jurisdiction: optional(data, "jurisdiction"),
      territory: optional(data, "territory"),
      scope: optional(data, "scope"),
    },
  };
}

/** Resolve the submitted origin into a validated `UploadedSource` (reads the file's bytes). */
export async function resolveUploadedSource(fields: VersionFields): Promise<Validation<UploadedSource>> {
  if (fields.origin === "WEB") {
    const url = validateWebUrl(fields.url);
    return url.ok ? { ok: true, value: { type: "WEB", url: url.value } } : url;
  }
  if (!fields.file) {
    return fail("Selecciona un archivo.");
  }
  const bytes = new Uint8Array(await fields.file.arrayBuffer());
  if (fields.origin === "PDF") {
    const pdf = validatePdf(fields.file.size, bytes);
    return pdf.ok ? { ok: true, value: { type: "PDF", data: pdf.value } } : pdf;
  }
  const textFile = validateTextFile(fields.file.size, bytes);
  return textFile.ok ? { ok: true, value: { type: "TEXT", text: textFile.value } } : textFile;
}
