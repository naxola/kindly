/**
 * `LLMProvider` backed by Google Gemini (`generateContent` with a JSON
 * schema response). Registered from `src/instrumentation.ts` when
 * `AI_PROVIDER=gemini` (or `GEMINI_API_KEY` is the only key set). Raw
 * `fetch`, no SDK; `fetchImpl` injectable so tests never hit the real API.
 */
import "server-only";
import type { LLMProvider, LLMStructuredRequest, LLMStructuredResult } from "@/modules/ai/llm-provider";

export interface GeminiLLMProviderConfig {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Base wait between retries of a transient failure (tests pass 0). */
  retryDelayMs?: number;
}

/** Google answers 503 under demand spikes; these are worth a short retry. */
const RETRYABLE_STATUSES = new Set([500, 503, 504]);
const MAX_ATTEMPTS = 3;

const DEFAULT_MODEL = "gemini-3.8-flash";

interface GenerateContentResponse {
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

export class GeminiLLMProvider implements LLMProvider {
  readonly id = "gemini";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelayMs: number;

  constructor(config: GeminiLLMProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.retryDelayMs = config.retryDelayMs ?? 800;
  }

  async generateStructured(request: LLMStructuredRequest): Promise<LLMStructuredResult> {
    let response: Response;
    for (let attempt = 1; ; attempt++) {
      response = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: "user", parts: [{ text: request.user }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: request.jsonSchema,
            },
          }),
        },
      );
      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
    }

    if (!response.ok) {
      // Gemini's message only — never the request, it carries the API key.
      const payload = (await response.json().catch(() => ({}))) as GenerateContentResponse;
      throw new Error(`Gemini generateContent ${response.status}: ${payload.error?.message ?? "unknown error"}`);
    }

    const body = (await response.json()) as GenerateContentResponse;
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (body.promptFeedback?.blockReason || !text) {
      throw new Error("Gemini returned no structured content.");
    }

    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new Error("Gemini returned content that is not valid JSON.");
    }
    return { output, model: body.modelVersion ?? this.model };
  }
}
