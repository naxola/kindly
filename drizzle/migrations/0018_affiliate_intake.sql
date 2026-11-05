CREATE TYPE "public"."affiliate_request_status" AS ENUM('PENDING', 'DUPLICATE', 'CONFIRMED', 'DISCARDED');--> statement-breakpoint
CREATE TABLE "affiliate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"dni" text NOT NULL,
	"birth_date" date,
	"gender" text,
	"street_type" text,
	"street" text,
	"street_number" text,
	"staircase" text,
	"floor" text,
	"door" text,
	"address_other" text,
	"country" text,
	"postal_code" text,
	"city" text,
	"address_province" text,
	"province" text,
	"sector" text,
	"employment_status" text,
	"monthly_fee_cents" integer,
	"workplace" text,
	"workplace_province" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "affiliate_request_status" NOT NULL,
	"dni" text NOT NULL,
	"contact_id" uuid,
	"duplicate_of_contact_id" uuid,
	"proposed_delegate_id" text,
	"final_delegate_id" text,
	"data" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_duplicate_of_contact_id_contacts_id_fk" FOREIGN KEY ("duplicate_of_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_proposed_delegate_id_users_id_fk" FOREIGN KEY ("proposed_delegate_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_final_delegate_id_users_id_fk" FOREIGN KEY ("final_delegate_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_keys" ADD CONSTRAINT "integration_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_keys" ADD CONSTRAINT "integration_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_profiles_contact_unique" ON "affiliate_profiles" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_profiles_org_dni_unique" ON "affiliate_profiles" USING btree ("organization_id","dni");--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_requests_open_dni_unique" ON "affiliate_requests" USING btree ("organization_id","dni") WHERE status in ('PENDING', 'DUPLICATE');--> statement-breakpoint
CREATE INDEX "affiliate_requests_org_status_idx" ON "affiliate_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_keys_hash_unique" ON "integration_keys" USING btree ("key_hash");