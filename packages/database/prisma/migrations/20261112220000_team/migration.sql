-- CreateTable
CREATE TABLE "member_positions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "member_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "phone" TEXT,
    "contact_email" CITEXT,
    "position_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "member_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT,
    "phone" TEXT,
    "position_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_positions_organization_id_id_key" ON "member_positions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "member_positions_organization_id_name_key" ON "member_positions"("organization_id", "name");

-- CreateIndex
CREATE INDEX "member_profiles_organization_id_position_id_idx" ON "member_profiles"("organization_id", "position_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_profiles_organization_id_id_key" ON "member_profiles"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "member_profiles_organization_id_member_id_key" ON "member_profiles"("organization_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_profiles_organization_id_id_key" ON "invitation_profiles"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_profiles_organization_id_invitation_id_key" ON "invitation_profiles"("organization_id", "invitation_id");

-- AddForeignKey
ALTER TABLE "member_positions" ADD CONSTRAINT "member_positions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_organization_id_member_id_fkey" FOREIGN KEY ("organization_id", "member_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_organization_id_position_id_fkey" FOREIGN KEY ("organization_id", "position_id") REFERENCES "member_positions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_profiles" ADD CONSTRAINT "invitation_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_profiles" ADD CONSTRAINT "invitation_profiles_organization_id_invitation_id_fkey" FOREIGN KEY ("organization_id", "invitation_id") REFERENCES "invitations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_profiles" ADD CONSTRAINT "invitation_profiles_organization_id_position_id_fkey" FOREIGN KEY ("organization_id", "position_id") REFERENCES "member_positions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Hand-written: phone format and tenant isolation (ADR 0002).
-- ============================================================================

-- E.164 (the application validates it too; this is the last line of defense).
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_phone_e164_check"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE "invitation_profiles" ADD CONSTRAINT "invitation_profiles_phone_e164_check"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE "member_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_positions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "member_positions"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "member_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "member_profiles"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "invitation_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitation_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitation_profiles"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());
