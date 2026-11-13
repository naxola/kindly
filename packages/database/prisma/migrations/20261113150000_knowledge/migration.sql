-- CreateEnum
CREATE TYPE "KnowledgeVisibility" AS ENUM ('GLOBAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('MANUAL', 'PDF', 'WEB');

-- CreateEnum
CREATE TYPE "DocumentVersionStatus" AS ENUM ('DRAFT', 'CURRENT', 'SUPERSEDED', 'REPEALED', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "KnowledgeChunkLevel" AS ENUM ('CHAPTER', 'SECTION', 'ARTICLE', 'PARAGRAPH', 'FRAGMENT');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "visibility" "KnowledgeVisibility" NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_url" TEXT,
    "jurisdiction" TEXT,
    "territory" TEXT,
    "scope" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_document_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "document_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "status" "DocumentVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE NOT NULL,
    "effective_until" DATE,
    "source" TEXT,
    "ingestion_status" "IngestionStatus" NOT NULL DEFAULT 'READY',
    "ingestion_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "visibility" "KnowledgeVisibility" NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "level" "KnowledgeChunkLevel" NOT NULL DEFAULT 'FRAGMENT',
    "label" TEXT,
    "path" TEXT,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_documents_organization_id_visibility_idx" ON "knowledge_documents"("organization_id", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_organization_id_id_key" ON "knowledge_documents"("organization_id", "id");

-- CreateIndex
CREATE INDEX "knowledge_document_versions_document_id_idx" ON "knowledge_document_versions"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_document_versions_organization_id_id_key" ON "knowledge_document_versions"("organization_id", "id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_organization_id_visibility_idx" ON "knowledge_chunks"("organization_id", "visibility");

-- CreateIndex
CREATE INDEX "knowledge_chunks_document_version_id_ordinal_idx" ON "knowledge_chunks"("document_version_id", "ordinal");

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document_versions" ADD CONSTRAINT "knowledge_document_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_document_versions" ADD CONSTRAINT "knowledge_document_versions_organization_id_document_id_fkey" FOREIGN KEY ("organization_id", "document_id") REFERENCES "knowledge_documents"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_document_id_fkey" FOREIGN KEY ("organization_id", "document_id") REFERENCES "knowledge_documents"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_document_version_id_fkey" FOREIGN KEY ("organization_id", "document_version_id") REFERENCES "knowledge_document_versions"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ============================================================================
-- Hand-written: what Prisma cannot express, and the RLS of the knowledge base (D8).
-- ============================================================================

-- Strict separation: a document (and its chunks) is GLOBAL exactly when it has no organization.
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_global_null_org"
  CHECK (("visibility" = 'GLOBAL') = ("organization_id" IS NULL));
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_global_null_org"
  CHECK (("visibility" = 'GLOBAL') = ("organization_id" IS NULL));

-- At most one CURRENT version per document (a new one supersedes the previous in the use case).
CREATE UNIQUE INDEX "knowledge_document_versions_current_unique"
  ON "knowledge_document_versions"("document_id") WHERE "status" = 'CURRENT';

-- Full text search (Spanish: the normative knowledge of the product is in Spanish).
ALTER TABLE "knowledge_chunks"
  ADD COLUMN "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('spanish', "content")) STORED;
CREATE INDEX "knowledge_chunks_content_tsv_idx" ON "knowledge_chunks" USING gin ("content_tsv");
-- No vector index on purpose. Every search filters by tenancy, validity and scope *before* ranking, so
-- an approximate (HNSW) index would lose recall under those filters and an exact scan over the
-- filtered rows is fast at the size of this corpus. Prisma also cannot declare an HNSW index (it
-- would report it as drift). Add one when the volume asks for it (docs/DECISIONS.md, M8a).

-- Row level security (ADR 0002 + D8). Reading: GLOBAL (no organization) plus the own organization.
-- Writing: only the own organization. GLOBAL knowledge is written only by the platform role
-- (app_platform, BYPASSRLS) from the operator script: no tenant can create or alter it.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['knowledge_documents', 'knowledge_document_versions', 'knowledge_chunks']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY knowledge_read ON %I FOR SELECT
      USING ("organization_id" IS NULL OR "organization_id" = app.current_org_id())$p$, t);
    EXECUTE format($p$CREATE POLICY knowledge_insert ON %I FOR INSERT
      WITH CHECK ("organization_id" = app.current_org_id())$p$, t);
    EXECUTE format($p$CREATE POLICY knowledge_update ON %I FOR UPDATE
      USING ("organization_id" = app.current_org_id())
      WITH CHECK ("organization_id" = app.current_org_id())$p$, t);
    EXECUTE format($p$CREATE POLICY knowledge_delete ON %I FOR DELETE
      USING ("organization_id" = app.current_org_id())$p$, t);
  END LOOP;
END $$;
