/**
 * `EmbeddingProvider` backed by Google Gemini (`gemini-embedding-001`,
 * `batchEmbedContents`). The model supports Matryoshka output sizes, so it
 * is asked for `EMBEDDING_DIMENSIONS` (1536) and the column does not change.
 * Vectors are L2-normalized (Gemini only returns normalized vectors at 3072).
 * Its `id` ("gemini:<model>") isolates its vectors from OpenAI's in search.
 */
import "server-only";
import { EMBEDDING_DIMENSIONS } from "@/modules/knowledge/schema";
import type { EmbeddingProvider } from "@/modules/knowledge/embedding-provider";

export interface GeminiEmbeddingProviderConfig {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = "gemini-embedding-001";
/** Gemini accepts at most 100 requests per batch. */
const MAX_BATCH = 100;

interface BatchEmbedResponse {
  embeddings?: { values: number[] }[];
  error?: { message?: string };
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vector : vector.map((v) => v / norm);
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly id: string;
  readonly dimensions = EMBEDDING_DIMENSIONS;

  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GeminiEmbeddingProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.id = `gemini:${this.model}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      out.push(...(await this.embedBatch(texts.slice(i, i + MAX_BATCH))));
    }
    return out;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents`,
      {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${this.model}`,
            content: { parts: [{ text }] },
            outputDimensionality: this.dimensions,
          })),
        }),
      },
    );

    const payload = (await response.json().catch(() => ({}))) as BatchEmbedResponse;
    if (!response.ok) {
      throw new Error(`Gemini embeddings ${response.status}: ${payload.error?.message ?? "unknown error"}`);
    }
    const embeddings = payload.embeddings ?? [];
    if (embeddings.length !== texts.length) {
      throw new Error(`Gemini returned ${embeddings.length} embeddings for ${texts.length} inputs.`);
    }
    for (const item of embeddings) {
      if (item.values.length !== this.dimensions) {
        throw new Error(`Gemini returned a ${item.values.length}-dimension vector, expected ${this.dimensions}.`);
      }
    }
    return embeddings.map((item) => normalize(item.values));
  }
}
