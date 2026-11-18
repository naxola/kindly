-- CreateEnum
CREATE TYPE "IngestionSourceKind" AS ENUM ('PDF', 'TEXT', 'WEB');

-- AlterTable
ALTER TABLE "knowledge_document_versions" ADD COLUMN     "requested_status" "DocumentVersionStatus",
ADD COLUMN     "source_data" BYTEA,
ADD COLUMN     "source_kind" "IngestionSourceKind",
ADD COLUMN     "source_url" TEXT;

