-- Enable pgvector before any vector(...) column or hnsw index below. Added by
-- hand (drizzle-kit does not emit CREATE EXTENSION) — same manual-SQL pattern
-- as 0004/0007. The docker-compose image is pgvector/pgvector:pg16 and Neon
-- ships pgvector, so the extension is available in every environment.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."document_version_status" AS ENUM('DRAFT', 'CURRENT', 'SUPERSEDED', 'REPEALED', 'HISTORICAL');--> statement-breakpoint
CREATE TYPE "public"."knowledge_chunk_level" AS ENUM('CHAPTER', 'SECTION', 'ARTICLE', 'PARAGRAPH', 'FRAGMENT');--> statement-breakpoint
CREATE TYPE "public"."knowledge_document_source_type" AS ENUM('MANUAL', 'PDF', 'WEB');--> statement-breakpoint
CREATE TYPE "public"."knowledge_visibility" AS ENUM('GLOBAL', 'ORGANIZATION');--> statement-breakpoint
CREATE TABLE "knowledge_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" text NOT NULL,
	"status" "document_version_status" DEFAULT 'DRAFT' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_until" date,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"visibility" "knowledge_visibility" NOT NULL,
	"title" text NOT NULL,
	"source_type" "knowledge_document_source_type" DEFAULT 'MANUAL' NOT NULL,
	"source_url" text,
	"jurisdiction" text,
	"territory" text,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_documents_global_null_org" CHECK (("knowledge_documents"."visibility" = 'GLOBAL') = ("knowledge_documents"."organization_id" is null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_version_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"organization_id" uuid,
	"visibility" "knowledge_visibility" NOT NULL,
	"ordinal" integer NOT NULL,
	"level" "knowledge_chunk_level" DEFAULT 'FRAGMENT' NOT NULL,
	"label" text,
	"path" text,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"content_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', content)) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_document_versions" ADD CONSTRAINT "knowledge_document_versions_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_version_id_knowledge_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."knowledge_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_document_versions_document_idx" ON "knowledge_document_versions" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_document_versions_current_unique" ON "knowledge_document_versions" USING btree ("document_id") WHERE status = 'CURRENT';--> statement-breakpoint
CREATE INDEX "knowledge_documents_org_visibility_idx" ON "knowledge_documents" USING btree ("organization_id","visibility");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_org_visibility_idx" ON "knowledge_chunks" USING btree ("organization_id","visibility");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_version_ordinal_idx" ON "knowledge_chunks" USING btree ("document_version_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_content_tsv_idx" ON "knowledge_chunks" USING gin ("content_tsv");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_embedding_hnsw_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);