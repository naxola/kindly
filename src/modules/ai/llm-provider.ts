/**
 * `LLMProvider` — the only way the domain talks to a language model
 * (`docs/ARCHITECTURE.md` §10, `CLAUDE.md` §2). Same registry shape as
 * `knowledge/embedding-provider.ts`: one active provider, held on
 * `globalThis`, registered from the outside (`src/instrumentation.ts`).
 *
 * The contract is *structured output only*: the caller passes a JSON Schema
 * and gets back a parsed JSON value — the domain never parses free text.
 */
import "server-only";

export interface LLMStructuredRequest {
  system: string;
  user: string;
  /** Name of the output schema (letters, digits, underscore). */
  schemaName: string;
  /** JSON Schema the output must satisfy. */
  jsonSchema: Record<string, unknown>;
}

export interface LLMStructuredResult {
  /** Parsed JSON as returned by the model — still untrusted, the caller validates it. */
  output: unknown;
  /** Exact model that served the request, for the audit trail. */
  model: string;
}

export interface LLMProvider {
  /** Stable identifier for logs/audit (e.g. "openai", "fake"). */
  readonly id: string;
  generateStructured(request: LLMStructuredRequest): Promise<LLMStructuredResult>;
}

declare global {
  var __kindlyLLMProvider: LLMProvider | undefined;
}

export function registerLLMProvider(provider: LLMProvider): void {
  globalThis.__kindlyLLMProvider = provider;
}

/** The active provider, or throw when none is registered. */
export function getLLMProvider(): LLMProvider {
  const provider = globalThis.__kindlyLLMProvider;
  if (!provider) {
    throw new Error("No LLMProvider is registered. The AI Copilot is not available until one is configured.");
  }
  return provider;
}

export function hasLLMProvider(): boolean {
  return globalThis.__kindlyLLMProvider !== undefined;
}

export function clearLLMProvider(): void {
  globalThis.__kindlyLLMProvider = undefined;
}
