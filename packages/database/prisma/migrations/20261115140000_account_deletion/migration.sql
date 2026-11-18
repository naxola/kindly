-- Account deletion (ADR 0019): request and scheduled date, both null while there is no request.
-- Additive: no data is touched. `users` is a global table (no tenant RLS), so no policy changes.
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(3),
ADD COLUMN "deletion_scheduled_for" TIMESTAMPTZ(3);

-- The daily job looks for due requests.
CREATE INDEX "users_deletion_scheduled_for_idx" ON "users"("deletion_scheduled_for");
