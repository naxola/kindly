ALTER TABLE "contacts" ADD COLUMN "is_unassigned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_read_at" timestamp with time zone;