-- CreateEnum
CREATE TYPE "MessagingAccountStatus" AS ENUM ('PENDING', 'CONNECTING', 'CONNECTED', 'DEGRADED', 'DISCONNECTED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateTable
CREATE TABLE "messaging_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delegate_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "phone" TEXT,
    "external_account_id" TEXT NOT NULL,
    "external_business_account_id" TEXT,
    "external_connection_id" TEXT,
    "display_name" TEXT,
    "status" "MessagingAccountStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "credentials_reference" TEXT,
    "connected_at" TIMESTAMPTZ(3),
    "disconnected_at" TIMESTAMPTZ(3),
    "last_sync_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messaging_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "messaging_account_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "raw_body" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "processing_error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "messaging_account_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "external_conversation_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "messaging_account_id" UUID NOT NULL,
    "external_message_id" TEXT NOT NULL,
    "external_chat_id" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "sent_from_device" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "delivery_status" "MessageDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "source_webhook_event_id" UUID,
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messaging_accounts_organization_id_delegate_id_idx" ON "messaging_accounts"("organization_id", "delegate_id");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_accounts_organization_id_id_key" ON "messaging_accounts"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_accounts_channel_external_account_id_key" ON "messaging_accounts"("channel", "external_account_id");

-- CreateIndex
CREATE INDEX "webhook_events_organization_id_received_at_idx" ON "webhook_events"("organization_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_organization_id_id_key" ON "webhook_events"("organization_id", "id");

-- CreateIndex
CREATE INDEX "conversations_organization_id_contact_id_idx" ON "conversations"("organization_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_organization_id_id_key" ON "conversations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_messaging_account_id_external_conversation_id_key" ON "conversations"("messaging_account_id", "external_conversation_id");

-- CreateIndex
CREATE INDEX "messages_organization_id_conversation_id_created_at_idx" ON "messages"("organization_id", "conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_organization_id_id_key" ON "messages"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_messaging_account_id_external_message_id_key" ON "messages"("messaging_account_id", "external_message_id");

-- AddForeignKey
ALTER TABLE "messaging_accounts" ADD CONSTRAINT "messaging_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_accounts" ADD CONSTRAINT "messaging_accounts_organization_id_delegate_id_fkey" FOREIGN KEY ("organization_id", "delegate_id") REFERENCES "organization_members"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organization_id_messaging_account_id_fkey" FOREIGN KEY ("organization_id", "messaging_account_id") REFERENCES "messaging_accounts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_messaging_account_id_fkey" FOREIGN KEY ("organization_id", "messaging_account_id") REFERENCES "messaging_accounts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_contact_id_fkey" FOREIGN KEY ("organization_id", "contact_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "conversations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_messaging_account_id_fkey" FOREIGN KEY ("organization_id", "messaging_account_id") REFERENCES "messaging_accounts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_source_webhook_event_id_fkey" FOREIGN KEY ("organization_id", "source_webhook_event_id") REFERENCES "webhook_events"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Hand-written: invariants, tenant isolation (ADR 0002) and the webhook context.
-- ============================================================================

ALTER TABLE "messaging_accounts" ADD CONSTRAINT "messaging_accounts_phone_e164_check"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{6,14}$');

-- The public webhook URL carries the account id before the organization is known. Like the
-- invitation token (identity migration), resolving it needs a context that only lets that one
-- row be READ; everything after runs in the account's own tenant context.
CREATE OR REPLACE FUNCTION app.current_messaging_account_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.messaging_account_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION app.current_messaging_account_id() TO app_user, app_platform;

ALTER TABLE "messaging_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messaging_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "messaging_accounts"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());
CREATE POLICY webhook_read ON "messaging_accounts" FOR SELECT
  USING ("id" = app.current_messaging_account_id());

ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "webhook_events"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "conversations"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());

ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "messages"
  USING ("organization_id" = app.current_org_id())
  WITH CHECK ("organization_id" = app.current_org_id());
