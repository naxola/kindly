/**
 * Cron endpoint: recomputes `search_text` and re-embeds knowledge chunks
 * that are stale or missing embeddings.
 *
 * Called by Vercel Cron (`vercel.json`) and also directly via POST from an
 * operator when forcing a full reindex after a migration or model change.
 *
 * Auth: `CRON_SECRET` header (same secret configured in Vercel env vars and
 * in `vercel.json` `authorization` for the cron trigger). Without it the
 * endpoint returns 401 — the embedding provider and DB are never touched.
 *
 * Query params:
 *   - `force=true`  — re-embed every chunk, even if already up to date
 *   - `documentId=<uuid>` — limit reindex to one document
 *
 * The job streams progress as NDJSON lines so Vercel logs capture it and
 * the caller can tail it with `curl`. Final line is a JSON summary.
 */
import "server-only";
import { reindexKnowledgeChunks } from "@/modules/knowledge/reindex";
import { hasEmbeddingProvider } from "@/modules/knowledge/embedding-provider";

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return unauthorized();

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) return unauthorized();

  if (!hasEmbeddingProvider()) {
    return Response.json({ error: "No embedding provider configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "true";
  const documentId = url.searchParams.get("documentId") ?? undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (line: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));

      try {
        write({ status: "started", force, documentId: documentId ?? null, at: new Date().toISOString() });

        const result = await reindexKnowledgeChunks({ force, documentId });

        write({ status: "done", ...result, at: new Date().toISOString() });
      } catch (err) {
        write({ status: "error", message: String(err), at: new Date().toISOString() });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "Transfer-Encoding": "chunked",
    },
  });
}

// Vercel Cron fires GET requests — proxy to POST with the Vercel-injected
// authorization header (set in vercel.json) so cron and manual POST share
// identical auth logic.
export async function GET(request: Request) {
  return POST(request);
}
