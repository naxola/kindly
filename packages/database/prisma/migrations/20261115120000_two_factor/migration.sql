-- ADR 0016: second factor (TOTP) of the access layer. Access tables only: nothing here references
-- the business (ADR 0003). Additive.
-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "auth_two_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "secret" TEXT NOT NULL,
    "backup_codes" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failed_verification_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_two_factors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_two_factors_user_id_idx" ON "auth_two_factors"("user_id");

-- AddForeignKey
ALTER TABLE "auth_two_factors" ADD CONSTRAINT "auth_two_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
