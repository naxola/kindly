/**
 * Real `LLMProvider`: OpenAI Chat Completions with strict JSON-schema
 * structured output (Fase 8). Registered from `src/instrumentation.ts` only
 * when `OPENAI_API_KEY` is set. Raw `fetch`, no SDK, `fetchImpl` injectable
 * so tests never hit the real API (`CLAUDE.md` §6).
 */
import "server-only";
import type { LLMProvider, LLMStructuredRequest, LLMStructuredResult } from "@/modules/ai/llm-provider";

export interface OpenAILLMProviderConfig {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = "gpt-4.1-mini";

interface ChatCompletionsResponse {
  model?: string;
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
}

export class OpenAILLMProvider implements LLMProvider {
  readonly id = "openai";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAILLMProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async generateStructured(request: LLMStructuredRequest): Promise<LLMStructuredResult> {
    const response = await this.fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI chat completion failed with status ${response.status}.`);
    }

    const body = (await response.json()) as ChatCompletionsResponse;
    const message = body.choices?.[0]?.message;
    if (!message || message.refusal || !message.content) {
      throw new Error("OpenAI returned no structured content.");
    }

    let output: unknown;
    try {
      output = JSON.parse(message.content);
    } catch {
      throw new Error("OpenAI returned content that is not valid JSON.");
    }
    return { output, model: body.model ?? this.model };
  }
}
