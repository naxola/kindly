-- Fase 8, paso 1: index/embed the chunk's hierarchical context, record the embedding model.
-- Existing rows get a provisional search_text (document + path + label + content) and
-- embedding_model = 'legacy' (excluded from vector search until `npm run knowledge:reindex`).
ALTER TABLE "knowledge_chunks" ADD COLUMN "search_text" text;--> statement-breakpoint
UPDATE "knowledge_chunks" AS c
SET "search_text" = concat_ws(E'\n', 'Documento: ' || d."title", 'Ubicación: ' || c."path", 'Fragmento: ' || c."label") || E'\n\n' || c."content"
FROM "knowledge_documents" AS d
WHERE d."id" = c."document_id";--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "search_text" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "embedding_model" text;--> statement-breakpoint
UPDATE "knowledge_chunks" SET "embedding_model" = 'legacy';--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "embedding_model" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" DROP COLUMN "content_tsv";--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD COLUMN "content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', search_text)) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_content_tsv_idx" ON "knowledge_chunks" USING gin ("content_tsv");
