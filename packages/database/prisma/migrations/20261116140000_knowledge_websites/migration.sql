-- A website as a knowledge source and its pages (docs/DECISIONS.md 2026-11-16).
-- CreateEnum
CREATE TYPE "KnowledgeWebsiteSource" AS ENUM ('SITEMAP', 'FEED', 'NONE');

-- CreateTable
CREATE TABLE "knowledge_websites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "discovery_source" "KnowledgeWebsiteSource" NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "discovered_at" TIMESTAMPTZ(3) NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1',
    "publish_as_current" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE,
    "effective_until" DATE,
    "source_note" TEXT,
    "jurisdiction" TEXT,
    "territory" TEXT,
    "scope" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_websites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_website_pages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "website_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "last_modified" TEXT,
    "document_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_website_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_websites_organization_id_id_key" ON "knowledge_websites"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_websites_organization_id_url_key" ON "knowledge_websites"("organization_id", "url");

-- CreateIndex
CREATE INDEX "knowledge_website_pages_organization_id_website_id_idx" ON "knowledge_website_pages"("organization_id", "website_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_website_pages_organization_id_id_key" ON "knowledge_website_pages"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_website_pages_website_id_url_key" ON "knowledge_website_pages"("website_id", "url");

-- AddForeignKey
ALTER TABLE "knowledge_websites" ADD CONSTRAINT "knowledge_websites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_website_pages" ADD CONSTRAINT "knowledge_website_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_website_pages" ADD CONSTRAINT "knowledge_website_pages_organization_id_website_id_fkey" FOREIGN KEY ("organization_id", "website_id") REFERENCES "knowledge_websites"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_website_pages" ADD CONSTRAINT "knowledge_website_pages_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ============================================================================
-- Hand-written: tenant isolation (ADR 0002).
-- ============================================================================
ALTER TABLE "knowledge_websites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_websites" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "knowledge_websites"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "knowledge_website_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_website_pages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "knowledge_website_pages"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());
