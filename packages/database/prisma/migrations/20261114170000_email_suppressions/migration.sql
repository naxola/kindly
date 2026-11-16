-- ADR 0017: addresses the product must not write to again (permanent bounces and complaints).
-- Global table (no tenant, no RLS). It stores the SHA-256 of the address, never the address.
-- CreateEnum
CREATE TYPE "EmailSuppressionReason" AS ENUM ('BOUNCE_PERMANENT', 'COMPLAINT');

-- CreateTable
CREATE TABLE "email_suppressions" (
    "email_hash" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "source_event_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("email_hash","reason")
);
