-- ADR 0018: retention of the audit log (24 months). `audit_logs` stays append-only for app_user:
-- the purge runs through a SECURITY DEFINER function that takes NO argument, so a bug or an abuse
-- of the application cannot delete anything newer. The policies bound it a second time: the owner
-- can only see and delete rows older than 24 months.
CREATE POLICY retention_read ON "audit_logs" FOR SELECT TO app_migrator
  USING ("created_at" < now() - interval '24 months');
CREATE POLICY retention_purge ON "audit_logs" FOR DELETE TO app_migrator
  USING ("created_at" < now() - interval '24 months');

-- Deletes one batch and returns how many rows went. The caller repeats while it returns a full
-- batch, so no single statement holds a long lock.
CREATE OR REPLACE FUNCTION app.purge_expired_audit_logs() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  deleted integer;
BEGIN
  WITH doomed AS (
    SELECT "id" FROM "audit_logs"
    WHERE "created_at" < now() - interval '24 months'
    LIMIT 5000
  )
  DELETE FROM "audit_logs" a USING doomed d WHERE a."id" = d."id";
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END
$$;
REVOKE ALL ON FUNCTION app.purge_expired_audit_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_expired_audit_logs() TO app_user;

-- Reading the activity newest first, page by page.
CREATE INDEX "audit_logs_organization_id_created_at_id_idx"
  ON "audit_logs" ("organization_id", "created_at" DESC, "id" DESC);
