CREATE TYPE "public"."procedure_version_status" AS ENUM('CURRENT', 'SUPERSEDED');--> statement-breakpoint
CREATE TABLE "procedure_required_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "procedure_required_documents_version_ordinal_unique" UNIQUE("procedure_version_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "procedure_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_version_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "procedure_steps_version_ordinal_unique" UNIQUE("procedure_version_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "procedure_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"procedure_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "procedure_version_status" DEFAULT 'CURRENT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procedure_versions_procedure_version_unique" UNIQUE("procedure_id","version")
);
--> statement-breakpoint
CREATE TABLE "procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "procedure_required_documents" ADD CONSTRAINT "procedure_required_documents_procedure_version_id_procedure_versions_id_fk" FOREIGN KEY ("procedure_version_id") REFERENCES "public"."procedure_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_steps" ADD CONSTRAINT "procedure_steps_procedure_version_id_procedure_versions_id_fk" FOREIGN KEY ("procedure_version_id") REFERENCES "public"."procedure_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_versions_current_unique" ON "procedure_versions" USING btree ("procedure_id") WHERE status = 'CURRENT';--> statement-breakpoint
CREATE INDEX "procedures_org_idx" ON "procedures" USING btree ("organization_id");