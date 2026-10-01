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

/** Matches questions a real answer would need normative backing for (E2E scenarios only). */
const NEEDS_BACKING = /\b(plazo|d[ií]as|derecho|cu[aá]nt)/i;

/**
 * The fake used by the E2E suite (`E2E_FAKE_LLM=true`, `src/instrumentation.ts`):
 * grounded when the prompt offers a source, an abstention when the last
 * message from the person asks something that needs backing and nothing was
 * offered, and a plain reply otherwise.
 */
export function createE2EFakeLLMProvider(): LLMProvider {
  const base = createFakeLLMProvider();
  return {
    id: "fake-e2e",
    async generateStructured(request: LLMStructuredRequest): Promise<LLMStructuredResult> {
      if (offeredSourceIds(request.user).length === 0) {
        const data = JSON.parse(request.user.slice(request.user.indexOf("{"))) as {
          conversacionReciente: { autor: string; texto: string }[];
        };
        const last = [...data.conversacionReciente].reverse().find((m) => m.autor === "persona");
        if (last && NEEDS_BACKING.test(last.texto)) {
          return {
            model: "fake-e2e-model",
            output: {
              issue: "La persona pregunta por un derecho o un plazo.",
              suggestedReply: "Tienes 30 días.",
              requiresKnowledge: true,
              evidenceLevel: "SUFFICIENT",
              sourceIds: [],
              warnings: [],
              missingInformation: ["No hay documentación cargada sobre este asunto."],
            },
          };
        }
      }
      return base.generateStructured(request);
    },
  };
}
