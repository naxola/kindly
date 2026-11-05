/**
 * Re-indexing of existing knowledge chunks (Fase 8, paso 1): recomputes each
 * chunk's `search_text` (`indexing.ts`) and re-embeds it with the active
 * `EmbeddingProvider` when the text changed, the chunk was embedded by a
 * different model (`embedding_model`), or `force` is set.
 *
 * Operator maintenance over the whole table (GLOBAL and every
 * organization's chunks), run by `scripts/reindex-knowledge.ts` after the
 * migration that introduced `search_text`/`embedding_model` or after
 * changing `OPENAI_EMBEDDING_MODEL`. Tenancy columns are never touched.
 * Idempotent: a second run with nothing changed updates nothing.
 */
import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, knowledgeChunks } from "@/modules/knowledge/schema";
import { getEmbeddingProvider } from "@/modules/knowledge/embedding-provider";
import { buildSearchText } from "@/modules/knowledge/indexing";

export interface ReindexResult {
  scanned: number;
  /** Chunks whose `search_text` changed. */
  textUpdated: number;
  /** Chunks re-embedded (text changed, other model, or forced). */
  reembedded: number;
}

export interface ReindexOptions {
  /** Re-embed every scanned chunk, even if up to date. */
  force?: boolean;
  /** Limit to one document (default: every chunk). */
  documentId?: string;
  batchSize?: number;
}

export async function reindexKnowledgeChunks(options: ReindexOptions = {}): Promise<ReindexResult> {
  const provider = getEmbeddingProvider();
  const batchSize = options.batchSize ?? 50;
  const result: ReindexResult = { scanned: 0, textUpdated: 0, reembedded: 0 };
  let cursor: string | null = null;

  for (;;) {
    const rows = await db
      .select({
        id: knowledgeChunks.id,
        path: knowledgeChunks.path,
        label: knowledgeChunks.label,
        content: knowledgeChunks.content,
        searchText: knowledgeChunks.searchText,
        embeddingModel: knowledgeChunks.embeddingModel,
        documentTitle: documents.title,
      })
      .from(knowledgeChunks)
      .innerJoin(documents, eq(documents.id, knowledgeChunks.documentId))
      .where(
        and(
          cursor ? gt(knowledgeChunks.id, cursor) : undefined,
          options.documentId ? eq(knowledgeChunks.documentId, options.documentId) : undefined,
        ),
      )
      .orderBy(asc(knowledgeChunks.id))
      .limit(batchSize);
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    result.scanned += rows.length;

    const pending = rows
      .map((row) => ({
        row,
        searchText: buildSearchText({
          documentTitle: row.documentTitle,
          path: row.path,
          label: row.label,
          content: row.content,
        }),
      }))
      .filter(({ row, searchText }) => options.force || searchText !== row.searchText || row.embeddingModel !== provider.id);
    if (pending.length === 0) continue;

    const vectors = await provider.embed(pending.map((p) => p.searchText));
    if (vectors.length !== pending.length) {
      throw new Error("EmbeddingProvider returned a different number of vectors than inputs.");
    }

    await db.transaction(async (tx) => {
      for (const [i, { row, searchText }] of pending.entries()) {
        await tx
          .update(knowledgeChunks)
          .set({ searchText, embedding: vectors[i], embeddingModel: provider.id })
          .where(eq(knowledgeChunks.id, row.id));
        if (searchText !== row.searchText) result.textUpdated += 1;
        result.reembedded += 1;
      }
    });
  }

  return result;
}
