-- CreateTable
CREATE TABLE "subscription_periods" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "plan_key" TEXT NOT NULL,
    "plan_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_periods_organization_id_subscription_id_period_key" ON "subscription_periods"("organization_id", "subscription_id", "period_start");

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_organization_id_subscription_id_fkey" FOREIGN KEY ("organization_id", "subscription_id") REFERENCES "subscriptions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing subscriptions: record the period they are in now (older periods keep being closed
-- from the last closed one; the close extrapolates what has no row). ADR 0014.
INSERT INTO "subscription_periods"
  ("id", "organization_id", "subscription_id", "period_start", "period_end", "plan_key", "plan_version", "updated_at")
SELECT gen_random_uuid(), "organization_id", "id", "current_period_start", "current_period_end",
       "plan_key", "plan_version", CURRENT_TIMESTAMP
FROM "subscriptions";

-- ============================================================================
-- RLS (ADR 0002).
-- ============================================================================
ALTER TABLE "subscription_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscription_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "subscription_periods"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

-- The history is evidence of what each period was billed with: it is never deleted.
REVOKE DELETE, TRUNCATE ON "subscription_periods" FROM app_user;
