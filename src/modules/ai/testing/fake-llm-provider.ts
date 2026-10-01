/**
 * Deterministic fake `LLMProvider` for the test suite. It reads the
 * `conocimiento` ids in the prompt's JSON and cites the first one (or none
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

/** Ids of the knowledge fragments the prompt offers (the `conocimiento` array of its JSON data block). */
export function offeredSourceIds(userPrompt: string): string[] {
  const json = userPrompt.slice(userPrompt.indexOf("{"));
  const data = JSON.parse(json) as { conocimiento?: { id: string }[] };
  return (data.conocimiento ?? []).map((k) => k.id);
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
      const firstSource = offeredSourceIds(request.user)[0];
      return {
        model: "fake-model",
        output: firstSource
          ? {
              issue: "La persona hace una consulta.",
              suggestedReply: "Hola, según la documentación, lo revisamos y te confirmamos.",
              requiresKnowledge: true,
              evidenceLevel: "PARTIAL",
              sourceIds: [firstSource],
              warnings: [],
              missingInformation: [],
            }
          : {
              issue: "La persona saluda o hace una consulta sin base normativa.",
              suggestedReply: "Hola, gracias por escribir. Lo revisamos y te respondemos enseguida.",
              requiresKnowledge: false,
              evidenceLevel: "INSUFFICIENT",
              sourceIds: [],
              warnings: [],
              missingInformation: [],
            },
      };
    },
  };
}
