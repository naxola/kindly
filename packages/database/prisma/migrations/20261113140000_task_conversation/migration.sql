-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "conversation_id" UUID;

-- CreateIndex
CREATE INDEX "tasks_organization_id_conversation_id_idx" ON "tasks"("organization_id", "conversation_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "conversations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Hand-written: tenant isolation (ADR 0002). `tasks` already has row level security forced with
-- the `tenant_isolation` policy (migration 20261113120000_tasks), which covers the new column.
-- The composite foreign key (organization_id, conversation_id) is what keeps a task from pointing
-- at a conversation of another organization, whatever the application code does.
-- ============================================================================
