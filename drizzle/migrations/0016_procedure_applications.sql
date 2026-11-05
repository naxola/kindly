CREATE TYPE "public"."procedure_application_status" AS ENUM('ACTIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."procedure_document_status" AS ENUM('REQUIRED', 'RECEIVED');--> statement-breakpoint
CREATE TABLE "procedure_application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"required_document_id" uuid NOT NULL,
	"status" "procedure_document_status" DEFAULT 'REQUIRED' NOT NULL,
	"received_at" timestamp with time zone,
	"received_channel" text,
	"received_message_id" uuid,
	"marked_by" text,
	CONSTRAINT "procedure_application_documents_unique" UNIQUE("application_id","required_document_id")
);
--> statement-breakpoint
CREATE TABLE "procedure_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"case_id" uuid,
	"procedure_id" uuid NOT NULL,
	"procedure_version_id" uuid NOT NULL,
	"status" "procedure_application_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "procedure_application_documents" ADD CONSTRAINT "procedure_application_documents_application_id_procedure_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."procedure_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_application_documents" ADD CONSTRAINT "procedure_application_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_application_documents" ADD CONSTRAINT "procedure_application_documents_required_document_id_procedure_required_documents_id_fk" FOREIGN KEY ("required_document_id") REFERENCES "public"."procedure_required_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_application_documents" ADD CONSTRAINT "procedure_application_documents_received_message_id_messages_id_fk" FOREIGN KEY ("received_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_application_documents" ADD CONSTRAINT "procedure_application_documents_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_applications" ADD CONSTRAINT "procedure_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_applications" ADD CONSTRAINT "procedure_applications_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_applications" ADD CONSTRAINT "procedure_applications_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_applications" ADD CONSTRAINT "procedure_applications_procedure_id_procedures_id_fk" FOREIGN KEY ("procedure_id") REFERENCES "public"."procedures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_applications" ADD CONSTRAINT "procedure_applications_procedure_version_id_procedure_versions_id_fk" FOREIGN KEY ("procedure_version_id") REFERENCES "public"."procedure_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_applications" ADD CONSTRAINT "procedure_applications_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "procedure_applications_org_contact_idx" ON "procedure_applications" USING btree ("organization_id","contact_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_applications_active_unique" ON "procedure_applications" USING btree ("contact_id","procedure_id") WHERE status = 'ACTIVE';