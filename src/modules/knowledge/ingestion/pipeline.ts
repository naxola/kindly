/**
 * Ingestion pipeline (Fase 7b): turn a raw source (a PDF, a web page, or
 * plain text) into a document version's chunks, and persist it. The single
 * function `scripts/ingest-knowledge.ts` and, later, 7e's UI both call —
 * already shaped so a future `after()` can wrap it without a rewrite (the
 * previous decision to not introduce a worker yet, `ARCHITECTURE.md` §8).
 *
 * Extraction and chunking are the only things this package adds:
 * embedding + persistence are 7a's `createDocumentVersion`, reused
 * unchanged — this never duplicates the GLOBAL/ORGANIZATION invariant, the
 * CURRENT-superseding transaction, or the tenancy denormalization.
 */
import "server-only";
import { extractPdfText } from "@/modules/knowledge/ingestion/extract-pdf";
import { fetchWebText } from "@/modules/knowledge/ingestion/extract-web";
import { chunkDocumentText } from "@/modules/knowledge/ingestion/chunking";
import { createDocumentVersion, type CreateDocumentVersionInput } from "@/modules/knowledge/service";

export type IngestionSource =
  | { type: "PDF"; data: Uint8Array }
  | { type: "WEB"; url: string; fetchImpl?: typeof fetch } // fetchImpl: tests only, never real network (CLAUDE.md §6).
  | { type: "TEXT"; text: string };

// Named `input`, not `source`, to avoid colliding with
// `CreateDocumentVersionInput.source` (a citation/provenance string, e.g.
// "BOE núm. 5, de 2024-01-10" — unrelated to where the content came from).
export type IngestDocumentVersionInput = Omit<CreateDocumentVersionInput, "chunks"> & {
  input: IngestionSource;
};

async function extractSourceText(source: IngestionSource): Promise<string> {
  switch (source.type) {
    case "PDF":
      return extractPdfText(source.data);
    case "WEB":
      return fetchWebText(source.url, { fetchImpl: source.fetchImpl });
    case "TEXT":
      return source.text;
  }
}

/**
 * Extract, chunk, embed and persist one document version from a raw
 * source. Requires an `EmbeddingProvider` to already be registered
 * (`embedding-provider.ts`) — same requirement as `createDocumentVersion`.
 */
export async function ingestDocumentVersion(versionInput: IngestDocumentVersionInput) {
  const { input, ...rest } = versionInput;
  const text = await extractSourceText(input);
  const chunks = chunkDocumentText(text);

  return createDocumentVersion({ ...rest, chunks });
}
