CREATE TABLE "contact_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"delegate_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"assigned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_delegate_id_users_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_assignments_active_unique" ON "contact_assignments" USING btree ("contact_id") WHERE ended_at is null;
--> statement-breakpoint
-- Backfill (PKG-014): every existing Contact that has at least one
-- Conversation gets assigned to the delegate of its most recently updated
-- one. A Contact with no Conversation at all (created manually, never
-- messaged) gets no row here — it stays visible to an ADMIN only until
-- someone assigns it, same as any Contact created after this migration
-- with no delegate picked yet.
INSERT INTO "contact_assignments" ("organization_id", "contact_id", "delegate_id", "started_at")
SELECT c."organization_id", c."id", sub."delegate_id", now()
FROM "contacts" c
JOIN LATERAL (
	SELECT ma."delegate_id"
	FROM "conversations" conv
	JOIN "messaging_accounts" ma ON ma."id" = conv."messaging_account_id"
	WHERE conv."contact_id" = c."id"
	ORDER BY conv."updated_at" DESC
	LIMIT 1
) sub ON true;