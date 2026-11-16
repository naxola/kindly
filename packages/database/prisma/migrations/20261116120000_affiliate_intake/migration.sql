-- Altas of affiliates from an automation (n8n): profiles, requests and integration keys.

-- CreateEnum
CREATE TYPE "AffiliateRequestStatus" AS ENUM ('PENDING', 'DUPLICATE', 'CONFIRMED', 'DISCARDED');

-- CreateTable
CREATE TABLE "affiliate_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "dni" TEXT NOT NULL,
    "birth_date" DATE,
    "gender" TEXT,
    "street_type" TEXT,
    "street" TEXT,
    "street_number" TEXT,
    "staircase" TEXT,
    "floor" TEXT,
    "door" TEXT,
    "address_other" TEXT,
    "country" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "address_province" TEXT,
    "province" TEXT,
    "sector" TEXT,
    "employment_status" TEXT,
    "monthly_fee_cents" INTEGER,
    "workplace" TEXT,
    "workplace_province" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "AffiliateRequestStatus" NOT NULL,
    "dni" TEXT NOT NULL,
    "contact_id" UUID,
    "duplicate_of_contact_id" UUID,
    "proposed_delegate_id" UUID,
    "final_delegate_id" UUID,
    "data" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "affiliate_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "created_by_id" UUID,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_profiles_organization_id_id_key" ON "affiliate_profiles"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_profiles_organization_id_contact_id_key" ON "affiliate_profiles"("organization_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_profiles_organization_id_dni_key" ON "affiliate_profiles"("organization_id", "dni");

-- CreateIndex
CREATE INDEX "affiliate_requests_organization_id_status_idx" ON "affiliate_requests"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_requests_organization_id_id_key" ON "affiliate_requests"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_keys_key_hash_key" ON "integration_keys"("key_hash");

-- CreateIndex
CREATE INDEX "integration_keys_organization_id_purpose_idx" ON "integration_keys"("organization_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "integration_keys_organization_id_id_key" ON "integration_keys"("organization_id", "id");

-- AddForeignKey
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_organization_id_duplicate_of_contact_id_fkey" FOREIGN KEY ("organization_id", "duplicate_of_contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_organization_id_proposed_delegate_id_fkey" FOREIGN KEY ("organization_id", "proposed_delegate_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_organization_id_final_delegate_id_fkey" FOREIGN KEY ("organization_id", "final_delegate_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_requests" ADD CONSTRAINT "affiliate_requests_organization_id_resolved_by_id_fkey" FOREIGN KEY ("organization_id", "resolved_by_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_keys" ADD CONSTRAINT "integration_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_keys" ADD CONSTRAINT "integration_keys_organization_id_created_by_id_fkey" FOREIGN KEY ("organization_id", "created_by_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ============================================================================
-- Hand-written: invariants Prisma cannot express, and tenant isolation (ADR 0002).
-- Altas of affiliates from an automation (docs/DECISIONS.md, 2026-11-16).
-- ============================================================================

-- One open request (waiting for a decision) per DNI and organization: a resend while it waits is
-- answered with the same request, also when two deliveries race.
CREATE UNIQUE INDEX "affiliate_requests_one_open_per_dni"
  ON "affiliate_requests"("organization_id", "dni") WHERE "status" IN ('PENDING', 'DUPLICATE');

ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_dni_shape_check"
  CHECK ("dni" ~ '^([0-9]{8}|[XYZ][0-9]{7})[A-Z]$');
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_fee_check"
  CHECK ("monthly_fee_cents" IS NULL OR "monthly_fee_cents" >= 0);

ALTER TABLE "affiliate_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "affiliate_profiles"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "affiliate_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliate_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "affiliate_requests"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

-- Integration keys. The public endpoint knows only the token: it resolves the organization with
-- `app.integration_key_hash` set to the hash of that token, and RLS lets it READ only that row.
-- Everything after runs in the organization's own tenant context.
CREATE OR REPLACE FUNCTION app.current_integration_key_hash() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.integration_key_hash', true), '') $$;
GRANT EXECUTE ON FUNCTION app.current_integration_key_hash() TO app_user, app_platform;

ALTER TABLE "integration_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "integration_keys"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());
CREATE POLICY key_lookup ON "integration_keys" FOR SELECT
  USING ("key_hash" = app.current_integration_key_hash());
