/**
 * Deterministic fake `LLMProvider` for the test suite. It reads the
 * `<fuente id="...">` tags the prompt offers and cites the first one (or none
 * when there are none), so tests exercise reconciliation without a network
 * call. Never registered outside tests/E2E (`CLAUDE.md` §3, §6).
 */
import type { LLMProvider, LLMStructuredRequest, LLMStructuredResult } from "@/modules/ai/llm-provider";

export interface FakeLLMOptions {
  /** Replace the generated output entirely (e.g. to simulate an invented source). */
  override?: (request: LLMStructuredRequest) => unknown;
  /** Make the provider throw. */
  fail?: boolean;
}

export function createFakeLLMProvider(options: FakeLLMOptions = {}): LLMProvider & { calls: LLMStructuredRequest[] } {
  const calls: LLMStructuredRequest[] = [];
  return {
    id: "fake",
    calls,
    async generateStructured(request: LLMStructuredRequest): Promise<LLMStructuredResult> {
      calls.push(request);
      if (options.fail) {
        throw new Error("fake LLM failure");
      }
      if (options.override) {
        return { output: options.override(request), model: "fake-model" };
      }
      const firstSource = /<fuente id="([^"]+)"/.exec(request.user)?.[1];
      return {
        model: "fake-model",
        output: {
          issue: "La persona hace una consulta.",
          suggestedReply: "Hola, gracias por escribir. Lo revisamos y te respondemos enseguida.",
          evidenceLevel: firstSource ? "PARTIAL" : "INSUFFICIENT",
          sourceIds: firstSource ? [firstSource] : [],
          warnings: [],
          missingInformation: firstSource ? [] : ["No hay documentación recuperada que respalde la respuesta."],
        },
      };
    },
  };
}
