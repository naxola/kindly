-- Usage counters (ADR 0012, amendment R3.3): running total per organization, metric and period.
-- Additive. Existing periods get their counter lazily (the first record of a period sums its
-- events once), so there is nothing to backfill and no event is touched.
CREATE TABLE "usage_counters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "value" DECIMAL(20,6) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usage_counters_organization_id_metric_period_start_key" ON "usage_counters"("organization_id", "metric", "period_start");

-- The `unique` metrics look for a subject inside the period.
CREATE INDEX "usage_events_organization_id_metric_subject_key_occurred_at_idx" ON "usage_events"("organization_id", "metric", "subject_key", "occurred_at");

ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (ADR 0002): the counter belongs to the tenant.
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usage_counters" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "usage_counters"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

-- A counter is a cache of the evidence: it may be rewritten, never deleted by the application.
REVOKE DELETE, TRUNCATE ON "usage_counters" FROM app_user;
