import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  documents,
  documentVersions,
  knowledgeChunks,
  type DocumentVersionStatus,
  type KnowledgeChunkLevel,
  type KnowledgeDocumentSourceType,
  type KnowledgeVisibility,
} from "@/modules/knowledge/schema";
import { getEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { knowledgeVisibilityCondition } from "@/modules/knowledge/visibility";

/**
 * Knowledge base write/read services (Fase 7a). Enforce two things the rest
 * of the RAG stack depends on:
 *
 *  1. **Strict GLOBAL vs ORGANIZATION separation** (`CLAUDE.md` §2,
 *     `PRODUCT.md` §11). Every read filters by `knowledgeVisibilityCondition`
 *     (GLOBAL + own org, never another org's private knowledge) — defense in
 *     depth on top of the `knowledge_documents_global_null_org` CHECK.
 *  2. Chunks carry a real embedding from the registered `EmbeddingProvider`,
 *     with `organization_id`/`visibility` denormalized from the parent
 *     document so 7c's hard filter needs no join (see `schema.ts` header).
 *
 * Ingestion (parsing a PDF/URL into `chunks`) and retrieval ranking are
 * later packages (7b/7c); here chunk contents are supplied by the caller and
 * embedded inline.
 */

interface CreateDocumentInput {
  /** Null ⟺ GLOBAL; a real id ⟺ ORGANIZATION. Enforced below and by the CHECK. */
  organizationId: string | null;
  visibility: KnowledgeVisibility;
  title: string;
  sourceType?: KnowledgeDocumentSourceType;
  sourceUrl?: string | null;
  jurisdiction?: string | null;
  territory?: string | null;
  scope?: string | null;
}

export async function createDocument(input: CreateDocumentInput) {
  assertVisibilityInvariant(input.visibility, input.organizationId);

  const [document] = await db
    .insert(documents)
    .values({
      organizationId: input.organizationId,
      visibility: input.visibility,
      title: input.title,
      sourceType: input.sourceType ?? "MANUAL",
      sourceUrl: input.sourceUrl ?? null,
      jurisdiction: input.jurisdiction ?? null,
      territory: input.territory ?? null,
      scope: input.scope ?? null,
    })
    .returning();

  return document;
}

export interface ChunkInput {
  ordinal: number;
  level?: KnowledgeChunkLevel;
  label?: string | null;
  path?: string | null;
  content: string;
}

export interface CreateDocumentVersionInput {
  documentId: string;
  version: string;
  /** Defaults to DRAFT. A CURRENT version supersedes the document's prior CURRENT. */
  status?: DocumentVersionStatus;
  /** 'YYYY-MM-DD'. */
  effectiveFrom: string;
  /** 'YYYY-MM-DD' or null (open-ended). */
  effectiveUntil?: string | null;
  source?: string | null;
  chunks: ChunkInput[];
}

/**
 * Insert a version and its chunks in one transaction. Chunk contents are
 * embedded via the registered `EmbeddingProvider` (throws if none is
 * registered — production until 7b+). `organization_id`/`visibility` on each
 * chunk are copied from the parent document, never taken from the caller.
 */
export async function createDocumentVersion(input: CreateDocumentVersionInput) {
  const status = input.status ?? "DRAFT";

  const contents = input.chunks.map((c) => c.content);
  const embeddings = contents.length > 0 ? await getEmbeddingProvider().embed(contents) : [];
  if (embeddings.length !== contents.length) {
    throw new Error("EmbeddingProvider returned a different number of vectors than inputs.");
  }

  return db.transaction(async (tx) => {
    const [document] = await tx
      .select({ organizationId: documents.organizationId, visibility: documents.visibility })
      .from(documents)
      .where(eq(documents.id, input.documentId))
      .limit(1);

    if (!document) {
      throw new Error(`Document ${input.documentId} not found.`);
    }

    // A new CURRENT supersedes the document's previous CURRENT (at most one,
    // by the partial unique index) — same "close the open row" shape as
    // memberships/contact_assignments.
    if (status === "CURRENT") {
      await tx
        .update(documentVersions)
        .set({ status: "SUPERSEDED" })
        .where(
          and(
            eq(documentVersions.documentId, input.documentId),
            eq(documentVersions.status, "CURRENT"),
          ),
        );
    }

    const [version] = await tx
      .insert(documentVersions)
      .values({
        documentId: input.documentId,
        version: input.version,
        status,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil ?? null,
        source: input.source ?? null,
      })
      .returning();

    if (input.chunks.length > 0) {
      await tx.insert(knowledgeChunks).values(
        input.chunks.map((chunk, i) => ({
          documentVersionId: version.id,
          documentId: input.documentId,
          organizationId: document.organizationId,
          visibility: document.visibility,
          ordinal: chunk.ordinal,
          level: chunk.level ?? ("FRAGMENT" as const),
          label: chunk.label ?? null,
          path: chunk.path ?? null,
          content: chunk.content,
          embedding: embeddings[i],
        })),
      );
    }

    return version;
  });
}

/**
 * Documents visible to an organization: its own plus GLOBAL, never another
 * organization's private knowledge. Newest first.
 */
export async function listDocumentsForOrganization(organizationId: string) {
  return db
    .select()
    .from(documents)
    .where(
      knowledgeVisibilityCondition(organizationId, {
        visibility: documents.visibility,
        organizationId: documents.organizationId,
      }),
    )
    .orderBy(desc(documents.createdAt));
}

/**
 * A document with its versions (newest first), respecting visibility —
 * returns null if it is neither GLOBAL nor owned by `organizationId`.
 */
export async function getDocumentWithVersions(id: string, organizationId: string) {
  const [document] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, id),
        knowledgeVisibilityCondition(organizationId, {
          visibility: documents.visibility,
          organizationId: documents.organizationId,
        }),
      ),
    )
    .limit(1);

  if (!document) {
    return null;
  }

  const versions = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, id))
    .orderBy(desc(documentVersions.effectiveFrom), asc(documentVersions.version));

  return { document, versions };
}

function assertVisibilityInvariant(
  visibility: KnowledgeVisibility,
  organizationId: string | null,
): void {
  if (visibility === "GLOBAL" && organizationId !== null) {
    throw new Error("GLOBAL knowledge must have no organization (organizationId must be null).");
  }
  if (visibility === "ORGANIZATION" && organizationId === null) {
    throw new Error("ORGANIZATION knowledge must belong to an organization (organizationId required).");
  }
}

/**
 * Chunks of one version in reading order, respecting visibility — empty if
 * the version's document is neither GLOBAL nor owned by `organizationId`
 * (the chunk row carries the denormalized tenancy columns, so no join).
 */
export async function listChunksForVersion(documentVersionId: string, organizationId: string) {
  return db
    .select({
      id: knowledgeChunks.id,
      ordinal: knowledgeChunks.ordinal,
      level: knowledgeChunks.level,
      label: knowledgeChunks.label,
      path: knowledgeChunks.path,
      content: knowledgeChunks.content,
    })
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.documentVersionId, documentVersionId),
        knowledgeVisibilityCondition(organizationId, {
          visibility: knowledgeChunks.visibility,
          organizationId: knowledgeChunks.organizationId,
        }),
      ),
    )
    .orderBy(asc(knowledgeChunks.ordinal));
}
