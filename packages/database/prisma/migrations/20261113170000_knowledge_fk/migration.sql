-- DropForeignKey
ALTER TABLE "knowledge_chunks" DROP CONSTRAINT "knowledge_chunks_organization_id_document_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_chunks" DROP CONSTRAINT "knowledge_chunks_organization_id_document_version_id_fkey";

-- DropForeignKey
ALTER TABLE "knowledge_document_versions" DROP CONSTRAINT "knowledge_document_versions_organization_id_document_id_fkey";

-- DropIndex
DROP INDEX "knowledge_document_versions_organization_id_id_key";

-- DropIndex
DROP INDEX "knowledge_documents_organization_id_id_key";

-- AddForeignKey
ALTER TABLE "knowledge_document_versions" ADD CONSTRAINT "knowledge_document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "knowledge_document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

