-- CreateEnum
CREATE TYPE "AffiliationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" CITEXT,
    "notes" TEXT,
    "is_unassigned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "delegate_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "assigned_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "member_number" TEXT,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "fee_paid_until" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_organization_id_created_at_idx" ON "contacts"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_organization_id_id_key" ON "contacts"("organization_id", "id");

-- CreateIndex
CREATE INDEX "contact_assignments_organization_id_contact_id_started_at_idx" ON "contact_assignments"("organization_id", "contact_id", "started_at");

-- CreateIndex
CREATE INDEX "contact_assignments_organization_id_delegate_id_idx" ON "contact_assignments"("organization_id", "delegate_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_assignments_organization_id_id_key" ON "contact_assignments"("organization_id", "id");

-- CreateIndex
CREATE INDEX "affiliations_organization_id_contact_id_idx" ON "affiliations"("organization_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliations_organization_id_id_key" ON "affiliations"("organization_id", "id");

-- CreateIndex
CREATE INDEX "activities_organization_id_entity_type_entity_id_created_at_idx" ON "activities"("organization_id", "entity_type", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_organization_id_delegate_id_fkey" FOREIGN KEY ("organization_id", "delegate_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_assignments" ADD CONSTRAINT "contact_assignments_organization_id_assigned_by_id_fkey" FOREIGN KEY ("organization_id", "assigned_by_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_actor_id_fkey" FOREIGN KEY ("organization_id", "actor_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Hand-written: invariants Prisma cannot express, and tenant isolation (ADR 0002).
-- ============================================================================

-- At most one open assignment and one open affiliation per contact, even under concurrency.
CREATE UNIQUE INDEX "contact_assignments_one_open_per_contact"
  ON "contact_assignments"("contact_id") WHERE "ended_at" IS NULL;
CREATE UNIQUE INDEX "affiliations_one_open_per_contact"
  ON "affiliations"("contact_id") WHERE "ended_at" IS NULL;

-- An affiliation is ACTIVE if and only if it is open.
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_status_matches_end_check"
  CHECK (("status" = 'ACTIVE') = ("ended_at" IS NULL));

-- E.164 (the application validates it too; this is the last line of defense).
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_phone_e164_check"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contacts"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "contact_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "contact_assignments"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "affiliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "affiliations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "affiliations"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

-- The timeline is append-only for the application, like audit_logs.
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "activities"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());
REVOKE UPDATE, DELETE, TRUNCATE ON "activities" FROM app_user;
