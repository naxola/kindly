/**
 * Upload orchestration for the Knowledge UI (Fase 7f): validated source →
 * text → chunks → embeddings → persisted version. Reuses the 7b extractors
 * and chunker and 7a's `createDocumentVersion` unchanged; adds only what the
 * UI needs on top — bounds on size/cost, friendly errors, cleanup of a
 * half-created document, and an audit trail.
 *
 * The uploaded file itself is never stored: only the extracted, chunked text
 * is (same principle as members' files, `docs/ui/CONVERSATION_WORKSPACE.md`
 * §5.2). Always ORGANIZATION-scoped: GLOBAL knowledge (affects every tenant)
 * stays operator-only (`scripts/ingest-knowledge.ts`) — `docs/DECISIONS.md`,
 * Fase 7f.
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documents } from "@/modules/knowledge/schema";
import { createDocument, createDocumentVersion } from "@/modules/knowledge/service";
import { getEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { extractPdfText } from "@/modules/knowledge/ingestion/extract-pdf";
import { fetchWebText } from "@/modules/knowledge/ingestion/extract-web";
import { chunkDocumentText } from "@/modules/knowledge/ingestion/chunking";
import {
  MAX_CHUNKS,
  MAX_EXTRACTED_CHARS,
  type DocumentFields,
  type UploadedSource,
  type VersionFields,
} from "@/modules/knowledge/ingestion/upload-validation";
import { recordActivity } from "@/modules/audit/service";

/** An error whose message is safe and meant to be shown to the user. */
export class UploadError extends Error {}

async function extractText(source: UploadedSource): Promise<string> {
  try {
    switch (source.type) {
      case "PDF":
        return await extractPdfText(source.data);
      case "TEXT":
        return source.text;
      case "WEB":
        return await fetchWebText(source.url);
    }
  } catch (error) {
    console.error("Knowledge extraction failed", error);
    if (source.type === "PDF") {
      throw new UploadError("No se pudo leer el PDF. Comprueba que no está protegido ni dañado.");
    }
    if (source.type === "WEB") {
      throw new UploadError("No se pudo descargar la página. Comprueba que la dirección es pública y accesible.");
    }
    throw new UploadError("No se pudo leer el archivo.");
  }
}

async function prepareChunks(source: UploadedSource) {
  try {
    getEmbeddingProvider();
  } catch {
    throw new UploadError("El servicio de embeddings no está configurado en este entorno.");
  }

  const text = (await extractText(source)).trim();
  if (!text) {
    throw new UploadError("No se encontró texto en el documento (¿un PDF escaneado como imagen?).");
  }
  if (text.length > MAX_EXTRACTED_CHARS) {
    throw new UploadError("El documento es demasiado largo. Divídelo en partes más pequeñas.");
  }
  const chunks = chunkDocumentText(text);
  if (chunks.length > MAX_CHUNKS) {
    throw new UploadError("El documento es demasiado largo. Divídelo en partes más pequeñas.");
  }
  return chunks;
}

const SOURCE_TYPE = { PDF: "PDF", WEB: "WEB", TEXT: "MANUAL" } as const;

function versionInput(documentId: string, fields: VersionFields, chunks: Awaited<ReturnType<typeof prepareChunks>>) {
  return {
    documentId,
    version: fields.version,
    status: fields.status,
    effectiveFrom: fields.effectiveFrom,
    effectiveUntil: fields.effectiveUntil,
    source: fields.sourceNote,
    chunks,
  };
}

interface UploadContext {
  organizationId: string;
  actorUserId: string;
  fields: VersionFields;
  source: UploadedSource;
}

/** A new ORGANIZATION document with its first version. */
export async function uploadKnowledgeDocument(input: UploadContext & { document: DocumentFields }) {
  const chunks = await prepareChunks(input.source);

  const document = await createDocument({
    organizationId: input.organizationId,
    visibility: "ORGANIZATION",
    title: input.document.title,
    sourceType: SOURCE_TYPE[input.source.type],
    sourceUrl: input.source.type === "WEB" ? input.source.url : null,
    jurisdiction: input.document.jurisdiction,
    territory: input.document.territory,
    scope: input.document.scope,
  });

  try {
    await createDocumentVersion(versionInput(document.id, input.fields, chunks));
  } catch (error) {
    // Don't leave an empty document behind (versions/chunks cascade).
    await db.delete(documents).where(eq(documents.id, document.id));
    throw error;
  }

  await recordActivity({
    organizationId: input.organizationId,
    type: "KNOWLEDGE_DOCUMENT_CREATED",
    actorUserId: input.actorUserId,
    entityType: "knowledge_document",
    entityId: document.id,
    metadata: { version: input.fields.version },
  });
  return document;
}

/** A new version of an existing document owned by the organization. */
export async function uploadKnowledgeVersion(input: UploadContext & { documentId: string }) {
  // Only the organization's own documents: GLOBAL ones are not editable from here.
  const [document] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.organizationId, input.organizationId),
        eq(documents.visibility, "ORGANIZATION"),
      ),
    )
    .limit(1);
  if (!document) {
    throw new UploadError("El documento no existe o no se puede modificar.");
  }

  const chunks = await prepareChunks(input.source);
  await createDocumentVersion(versionInput(document.id, input.fields, chunks));

  await recordActivity({
    organizationId: input.organizationId,
    type: "KNOWLEDGE_VERSION_PUBLISHED",
    actorUserId: input.actorUserId,
    entityType: "knowledge_document",
    entityId: document.id,
    metadata: { version: input.fields.version },
  });
  return document;
}
