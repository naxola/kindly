/**
 * Operator tool: re-index every knowledge chunk (`knowledge/reindex.ts`) —
 * recompute `search_text` and re-embed what is stale or from another
 * embedding model. Run after applying migration 0012 and after changing
 * `OPENAI_EMBEDDING_MODEL`. Same `NODE_OPTIONS=--conditions=react-server`
 * pattern as `scripts/ingest-knowledge.ts` (see its header).
 *
 * Usage (fish):
 *   env DATABASE_URL='<url>' OPENAI_API_KEY='<key>' npm run knowledge:reindex
 *   npm run knowledge:reindex -- --force        # re-embed everything
 *   npm run knowledge:reindex -- --provider fake # dev/testing only
 */
import "dotenv/config";

async function registerProvider(fake: boolean) {
  const { registerEmbeddingProvider } = await import("@/modules/knowledge/embedding-provider");
  if (fake) {
    console.warn("[knowledge:reindex] --provider fake: vectors are semantically meaningless. Dev/testing only.");
    const { createFakeEmbeddingProvider } = await import("@/modules/knowledge/testing/fake-embedding-provider");
    registerEmbeddingProvider(createFakeEmbeddingProvider());
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Set it (env var or .env) or pass --provider fake for a dev/test run.");
  }
  const { OpenAIEmbeddingProvider } = await import("@/modules/knowledge/openai-embedding-provider");
  registerEmbeddingProvider(
    new OpenAIEmbeddingProvider({ apiKey, model: process.env.OPENAI_EMBEDDING_MODEL || undefined }),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== "--force" && a !== "--provider" && a !== "fake");
  if (unknown.length > 0 || (args.includes("--provider") && !args.includes("fake"))) {
    throw new Error(`Unknown arguments: ${args.join(" ")}. Allowed: --force, --provider fake.`);
  }
  await registerProvider(args.includes("--provider"));

  const { reindexKnowledgeChunks } = await import("@/modules/knowledge/reindex");
  const result = await reindexKnowledgeChunks({ force: args.includes("--force") });
  console.log(`Scanned: ${result.scanned} · search_text updated: ${result.textUpdated} · re-embedded: ${result.reembedded}`);
}

// The shared postgres pool is never closed by this script (see ingest-knowledge.ts).
main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
