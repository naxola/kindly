-- Files in conversations (docs/DECISIONS.md 2026-11-16): a message keeps only a descriptor of its file
-- ({ kind, mediaId, mimeType, filename }), never the file. Kindly does not store the affiliates' files.
ALTER TABLE "messages" ADD COLUMN "attachment" JSONB;
