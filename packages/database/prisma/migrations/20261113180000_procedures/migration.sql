-- CreateEnum
CREATE TYPE "ProcedureVersionStatus" AS ENUM ('CURRENT', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "procedures" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "procedure_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ProcedureVersionStatus" NOT NULL DEFAULT 'CURRENT',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedure_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_steps" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "procedure_version_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "procedure_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedure_required_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "procedure_version_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "procedure_required_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "procedures_organization_id_name_idx" ON "procedures"("organization_id", "name");

-- CreateIndex
CREATE INDEX "procedure_versions_organization_id_idx" ON "procedure_versions"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_versions_procedure_id_version_key" ON "procedure_versions"("procedure_id", "version");

-- CreateIndex
CREATE INDEX "procedure_steps_organization_id_idx" ON "procedure_steps"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_steps_procedure_version_id_ordinal_key" ON "procedure_steps"("procedure_version_id", "ordinal");

-- CreateIndex
CREATE INDEX "procedure_required_documents_organization_id_idx" ON "procedure_required_documents"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "procedure_required_documents_procedure_version_id_ordinal_key" ON "procedure_required_documents"("procedure_version_id", "ordinal");

-- AddForeignKey
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_steps" ADD CONSTRAINT "procedure_steps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_steps" ADD CONSTRAINT "procedure_steps_procedure_version_id_fkey" FOREIGN KEY ("procedure_version_id") REFERENCES "procedure_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_required_documents" ADD CONSTRAINT "procedure_required_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procedure_required_documents" ADD CONSTRAINT "procedure_required_documents_procedure_version_id_fkey" FOREIGN KEY ("procedure_version_id") REFERENCES "procedure_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ============================================================================
-- Hand-written: at most one CURRENT version per procedure (publishing supersedes the previous
-- one in the use case) and tenant isolation (ADR 0002).
-- ============================================================================
CREATE UNIQUE INDEX "procedure_versions_current_unique"
  ON "procedure_versions"("procedure_id") WHERE "status" = 'CURRENT';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['procedures', 'procedure_versions', 'procedure_steps', 'procedure_required_documents']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON %I
      USING ("organization_id" = app.current_org_id())
      WITH CHECK ("organization_id" = app.current_org_id())$p$, t);
  END LOOP;
END $$;
