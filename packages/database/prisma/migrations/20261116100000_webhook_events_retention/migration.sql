-- Retention of webhook_events (docs/DECISIONS.md, 2026-11-16): the raw body of a webhook holds phone
-- numbers and message text that `messages` already keeps in its own form, so it does not stay for ever.
--   * processed events (processed_at set): 30 days
--   * everything else (failed or never processed): 90 days, to retry and diagnose
-- The purge runs through a SECURITY DEFINER function that takes NO argument, so a bug or an abuse of
-- the application cannot delete anything newer (same pattern as the audit log, ADR 0018). The policies
-- bound the owner a second time: it can only see and delete expired events, and the only thing it can
-- do to messages is clear the link to an expired event.
CREATE POLICY retention_read ON "webhook_events" FOR SELECT TO app_migrator
  USING (
    ("processed_at" IS NOT NULL AND "received_at" < now() - interval '30 days')
    OR "received_at" < now() - interval '90 days'
  );
CREATE POLICY retention_purge ON "webhook_events" FOR DELETE TO app_migrator
  USING (
    ("processed_at" IS NOT NULL AND "received_at" < now() - interval '30 days')
    OR "received_at" < now() - interval '90 days'
  );

-- `messages.source_webhook_event_id` is ON DELETE RESTRICT (the message must not lose its origin by
-- accident), so the purge clears it first. The EXISTS subquery sees only expired events (their SELECT
-- policy), so the owner can only change messages whose event is expired. The SELECT policy also lets
-- it see messages with no link, because Postgres checks the NEW row of an UPDATE against it too (the
-- row has just lost its link); the function never reads them.
CREATE POLICY retention_unlink_read ON "messages" FOR SELECT TO app_migrator
  USING (
    "source_webhook_event_id" IS NULL
    OR EXISTS (
      SELECT 1 FROM "webhook_events" e
      WHERE e."organization_id" = "messages"."organization_id" AND e."id" = "messages"."source_webhook_event_id"
    )
  );
CREATE POLICY retention_unlink ON "messages" FOR UPDATE TO app_migrator
  USING (
    "source_webhook_event_id" IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "webhook_events" e
      WHERE e."organization_id" = "messages"."organization_id" AND e."id" = "messages"."source_webhook_event_id"
    )
  )
  WITH CHECK ("source_webhook_event_id" IS NULL);

-- Deletes one batch (oldest first) and returns how many events went. The caller repeats while it
-- returns a full batch, so no single statement holds a long lock.
CREATE OR REPLACE FUNCTION app.purge_expired_webhook_events() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
DECLARE
  doomed uuid[];
  deleted integer;
BEGIN
  SELECT coalesce(array_agg(s."id"), '{}') INTO doomed FROM (
    SELECT "id" FROM "webhook_events"
    WHERE ("processed_at" IS NOT NULL AND "received_at" < now() - interval '30 days')
       OR "received_at" < now() - interval '90 days'
    ORDER BY "received_at"
    LIMIT 1000
  ) s;
  UPDATE "messages" SET "source_webhook_event_id" = NULL WHERE "source_webhook_event_id" = ANY (doomed);
  DELETE FROM "webhook_events" WHERE "id" = ANY (doomed);
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END
$$;
REVOKE ALL ON FUNCTION app.purge_expired_webhook_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_expired_webhook_events() TO app_user;

-- The purge scans every organization by age; and unlinking looks messages up by their source event.
CREATE INDEX "webhook_events_received_at_idx" ON "webhook_events"("received_at");
CREATE INDEX "messages_source_webhook_event_id_idx" ON "messages"("source_webhook_event_id");
