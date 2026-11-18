-- CreateEnum
CREATE TYPE "BillingPeriodStatus" AS ENUM ('NO_CHARGE', 'PENDING_CHARGE', 'CHARGED', 'CHARGE_FAILED');

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "plan_key" TEXT NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "fixed_price" DECIMAL(14,2) NOT NULL,
    "overage_total" DECIMAL(14,2) NOT NULL,
    "spend_cap" DECIMAL(14,2),
    "amount_due" DECIMAL(14,2) NOT NULL,
    "status" "BillingPeriodStatus" NOT NULL,
    "provider_charge_ref" TEXT,
    "charged_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_period_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "used" DECIMAL(20,6) NOT NULL,
    "included" DECIMAL(20,6),
    "overage_units" DECIMAL(20,6) NOT NULL,
    "unit_price" DECIMAL(14,6) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "billing_period_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_periods_organization_id_period_start_idx" ON "billing_periods"("organization_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_organization_id_id_key" ON "billing_periods"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_organization_id_subscription_id_period_star_key" ON "billing_periods"("organization_id", "subscription_id", "period_start");

-- CreateIndex
CREATE INDEX "billing_period_lines_organization_id_idx" ON "billing_period_lines"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_period_lines_period_id_metric_key" ON "billing_period_lines"("period_id", "metric");

-- AddForeignKey
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_period_lines" ADD CONSTRAINT "billing_period_lines_organization_id_period_id_fkey" FOREIGN KEY ("organization_id", "period_id") REFERENCES "billing_periods"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- RLS (ADR 0002) and integrity (ADR 0012).
-- ============================================================================
ALTER TABLE "billing_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "billing_periods"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "billing_period_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_period_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "billing_period_lines" FOR SELECT
  USING ("organization_id" = app.current_org_id());
CREATE POLICY tenant_insert ON "billing_period_lines" FOR INSERT
  WITH CHECK ("organization_id" = app.current_org_id());

-- A closed period is evidence: the application can only update how it was charged.
REVOKE UPDATE, DELETE, TRUNCATE ON "billing_periods" FROM app_user;
GRANT UPDATE ("status", "provider_charge_ref", "charged_at", "updated_at") ON "billing_periods" TO app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON "billing_period_lines" FROM app_user;

-- The hourly close (a platform job) needs to know WHICH organizations have a subscription,
-- and nothing else. The owner reads them through this function; the tables keep their RLS.
CREATE POLICY close_scan ON "subscriptions" FOR SELECT TO app_migrator USING (true);
CREATE OR REPLACE FUNCTION app.organizations_with_subscription() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT "organization_id" FROM "subscriptions" $$;
REVOKE ALL ON FUNCTION app.organizations_with_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.organizations_with_subscription() TO app_user;
