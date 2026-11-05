CREATE TYPE "public"."knowledge_website_page_status" AS ENUM('DISCOVERED', 'PENDING', 'INDEXING', 'INDEXED', 'FAILED');--> statement-breakpoint
CREATE TABLE "knowledge_website_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"last_modified" text,
	"status" "knowledge_website_page_status" DEFAULT 'DISCOVERED' NOT NULL,
	"error" text,
	"document_id" uuid,
	"started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"image_url" text,
	"discovery_source" text DEFAULT 'none' NOT NULL,
	"discovered_at" timestamp with time zone,
	"options" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_website_pages" ADD CONSTRAINT "knowledge_website_pages_website_id_knowledge_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."knowledge_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_website_pages" ADD CONSTRAINT "knowledge_website_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_website_pages" ADD CONSTRAINT "knowledge_website_pages_document_id_knowledge_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_websites" ADD CONSTRAINT "knowledge_websites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_websites" ADD CONSTRAINT "knowledge_websites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_website_pages_website_url_unique" ON "knowledge_website_pages" USING btree ("website_id","url");--> statement-breakpoint
CREATE INDEX "knowledge_website_pages_org_website_idx" ON "knowledge_website_pages" USING btree ("organization_id","website_id");--> statement-breakpoint
CREATE INDEX "knowledge_website_pages_website_status_idx" ON "knowledge_website_pages" USING btree ("website_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_websites_org_url_unique" ON "knowledge_websites" USING btree ("organization_id","url");