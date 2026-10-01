/**
 * Operator tool: ingest a PDF, a web page or a plain text file into the
 * Knowledge base (Fase 7b) — extraction + hierarchical chunking +
 * embeddings + persistence, reusing `ingestDocumentVersion`
 * (`knowledge/ingestion/pipeline.ts`) unchanged. Since Fase 7f an ADMIN
 * uploads their organization's knowledge from the UI; this script remains
 * the only way to load GLOBAL knowledge (laws, official guides).
 *
 * This script imports `knowledge/service.ts` and friends, which start with
 * `import "server-only"` — that throws under a plain Node/tsx run unless
 * the module resolver is given the `"react-server"` condition (confirmed:
 * `node` throws, `node --conditions=react-server` doesn't). Hence the
 * `NODE_OPTIONS` in the npm script (`package.json`) instead of duplicating
 * `service.ts`'s logic here by hand — see `docs/DECISIONS.md`, entrada
 * "Fase 7b", for the full rationale and the pattern for future scripts.
 *
 * Usage (fish):
 *   env DATABASE_URL='<url>' OPENAI_API_KEY='<key>' npm run knowledge:ingest -- \
 *     --title "Ley de Extranjería" --visibility GLOBAL \
 *     --version "1.0" --effective-from 2024-01-01 \
 *     --pdf ./ley.pdf
 *
 * Or set DATABASE_URL/OPENAI_API_KEY in .env (loaded automatically) and
 * just: npm run knowledge:ingest -- --title ... (same flags).
 *
 * --provider fake skips OpenAI and uses the deterministic fake embedding
 * (semantically meaningless — dev/testing only, never for real knowledge).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { parseIngestArgs, type IngestArgs } from "./lib/knowledge-ingest-args";
import type { IngestionSource } from "@/modules/knowledge/ingestion/pipeline";
import type { KnowledgeDocumentSourceType } from "@/modules/knowledge/schema";

const DOCUMENT_SOURCE_TYPE: Record<IngestArgs["input"]["type"], KnowledgeDocumentSourceType> = {
  PDF: "PDF",
  URL: "WEB",
  TEXT_FILE: "MANUAL",
};

async function resolveSource(input: IngestArgs["input"]): Promise<IngestionSource> {
  switch (input.type) {
    case "TEXT_FILE":
      return { type: "TEXT", text: await readFile(input.path, "utf8") };
    case "URL":
      return { type: "WEB", url: input.url };
    case "PDF": {
      const isRemote = /^https?:\/\//i.test(input.location);
      const data = isRemote
        ? new Uint8Array(await (await fetch(input.location)).arrayBuffer())
        : new Uint8Array(await readFile(input.location));
      return { type: "PDF", data };
    }
  }
}

async function registerProvider(args: IngestArgs) {
  const { registerEmbeddingProvider } = await import("@/modules/knowledge/embedding-provider");

  if (args.provider === "fake") {
    console.warn(
      "[knowledge:ingest] --provider fake: vectors are semantically meaningless. Never use this for real knowledge.",
    );
    const { createFakeEmbeddingProvider } = await import("@/modules/knowledge/testing/fake-embedding-provider");
    registerEmbeddingProvider(createFakeEmbeddingProvider());
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Set it (env var or .env) or pass --provider fake for a dev/test run.",
    );
  }
  const { OpenAIEmbeddingProvider } = await import("@/modules/knowledge/openai-embedding-provider");
  registerEmbeddingProvider(new OpenAIEmbeddingProvider({ apiKey }));
}

async function main() {
  const args = parseIngestArgs(process.argv.slice(2));
  await registerProvider(args);

  const { createDocument } = await import("@/modules/knowledge/service");
  const { ingestDocumentVersion } = await import("@/modules/knowledge/ingestion/pipeline");

  const documentId =
    args.documentId ??
    (
      await createDocument({
        organizationId: args.organizationId,
        visibility: args.visibility!,
        title: args.title!,
        sourceType: DOCUMENT_SOURCE_TYPE[args.input.type],
        sourceUrl: args.input.type === "URL" ? args.input.url : null,
        jurisdiction: args.jurisdiction,
        territory: args.territory,
        scope: args.scope,
      })
    ).id;

  const input = await resolveSource(args.input);
  const version = await ingestDocumentVersion({
    documentId,
    version: args.version,
    status: args.status,
    effectiveFrom: args.effectiveFrom,
    effectiveUntil: args.effectiveUntil,
    source: args.sourceNote,
    input,
  });

  console.log(`Document: ${documentId}`);
  console.log(`Version: ${version.id} (${version.version}, ${version.status})`);
}

// `@/db/client`'s postgres pool is cached on `globalThis` (shared with the
// whole app) and nothing closes it — without an explicit exit, this
// one-shot CLI hangs after finishing, waiting on connections that are never
// going to close themselves (same reasoning as `scripts/reset-password.ts`
// closing its own connection explicitly, adapted here since this script
// doesn't own the pool it uses).
main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
