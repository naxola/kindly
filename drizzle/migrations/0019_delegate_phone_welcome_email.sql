ALTER TABLE "organization_members" ADD COLUMN "phone_e164" text;--> statement-breakpoint
ALTER TABLE "contact_assignments" ADD COLUMN "welcome_sent_at" timestamp with time zone;