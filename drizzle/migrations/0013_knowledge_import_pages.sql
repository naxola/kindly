CREATE TYPE "public"."knowledge_import_page_status" AS ENUM('PENDING', 'INDEXING', 'INDEXED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "knowledge_import_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"site_url" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"status" "knowledge_import_page_status" DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"document_id" uuid,
	"options" jsonb NOT NULL,
	"created_by" text,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_import_pages" ADD CONSTRAINT "knowledge_import_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_import_pages" ADD CONSTRAINT "knowledge_import_pages_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_import_pages" ADD CONSTRAINT "knowledge_import_pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_import_pages_org_batch_idx" ON "knowledge_import_pages" USING btree ("organization_id","batch_id");--> statement-breakpoint
CREATE INDEX "knowledge_import_pages_batch_status_idx" ON "knowledge_import_pages" USING btree ("batch_id","status");