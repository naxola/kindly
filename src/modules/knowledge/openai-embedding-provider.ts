/**
 * Real `EmbeddingProvider`: OpenAI's embeddings API (Fase 7b). Registered
 * from `src/instrumentation.ts` when `OPENAI_API_KEY` is set — nothing
 * here runs unless that key is present.
 *
 * Raw `fetch` to OpenAI's REST endpoint, no SDK — same reasoning as
 * `ResendEmailSender` (`email/resend.ts`): one call doesn't justify a
 * dependency. `fetchImpl` is injectable so tests never hit the real API
 * (`CLAUDE.md` §6).
 */
import "server-only";
import { EMBEDDING_DIMENSIONS } from "@/modules/knowledge/schema";
import type { EmbeddingProvider } from "@/modules/knowledge/embedding-provider";

export interface OpenAIEmbeddingProviderConfig {
  apiKey: string;
  model?: string;
  /** Injectable for tests — never a real network call in CI. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = "text-embedding-3-small";

interface OpenAIEmbeddingsResponse {
  data: { index: number; embedding: number[] }[];
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAIEmbeddingProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.id = `openai:${this.model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.fetchImpl("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      // OpenAI's message only — never the request, it carries the API key.
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(`OpenAI embeddings ${response.status}: ${payload.error?.message ?? "unknown error"}`);
    }

    const payload = (await response.json()) as OpenAIEmbeddingsResponse;
    if (payload.data.length !== texts.length) {
      throw new Error(
        `OpenAI returned ${payload.data.length} embeddings for ${texts.length} inputs.`,
      );
    }

    // The API returns results sorted by `index`, but sort defensively —
    // nothing downstream should depend on an unwritten guarantee.
    const sorted = [...payload.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      if (item.embedding.length !== this.dimensions) {
        throw new Error(
          `OpenAI returned a ${item.embedding.length}-dimension vector, expected ${this.dimensions}.`,
        );
      }
    }

    return sorted.map((item) => item.embedding);
  }
}
