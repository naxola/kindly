-- R2.3: one pending invitation per (organization, email), guaranteed by the database.
-- Prisma cannot express partial indexes, so it lives only here.

-- Duplicates created by the old check-then-insert race: keep the newest, revoke the rest.
-- The table forces RLS even on its owner, and a migration has no tenant context: lift it for
-- this one statement (same transaction) and restore it.
ALTER TABLE "invitations" NO FORCE ROW LEVEL SECURITY;

UPDATE "invitations" i
SET "revoked_at" = now()
WHERE i."accepted_at" IS NULL
  AND i."revoked_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "invitations" n
    WHERE n."organization_id" = i."organization_id"
      AND n."email" = i."email"
      AND n."accepted_at" IS NULL
      AND n."revoked_at" IS NULL
      AND (n."created_at", n."id") > (i."created_at", i."id")
  );

ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "invitations_pending_email_key"
  ON "invitations" ("organization_id", "email")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;
