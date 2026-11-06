-- ============================================================================
-- Foundation (ADR 0002): grants per role and tenant helper.
-- Runs as app_migrator, owner of the public schema.
-- ============================================================================
GRANT USAGE ON SCHEMA public TO app_user, app_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, app_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user, app_platform;

-- Active organization of the transaction (set by withTenant).
-- Returns NULL without context: no RLS policy lets rows with NULL through.
CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO app_user, app_platform;
CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION app.current_org_id() TO app_user, app_platform;

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "default_locale" TEXT NOT NULL DEFAULT 'es',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "correlation_id" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_resource_type_resource_id_idx" ON "audit_logs"("organization_id", "resource_type", "resource_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Row-Level Security (ADR 0002). FORCE so that not even the owner bypasses it.
-- ============================================================================
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organizations"
  USING ("id" = app.current_org_id())
  WITH CHECK ("id" = app.current_org_id());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON "audit_logs" FOR SELECT
  USING ("organization_id" = app.current_org_id());
-- Events without an organization (e.g. security events before login) can be written, not read.
CREATE POLICY tenant_insert ON "audit_logs" FOR INSERT
  WITH CHECK ("organization_id" IS NULL OR "organization_id" = app.current_org_id());
-- Append-only.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM app_user;
