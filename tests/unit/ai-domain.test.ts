import { describe, expect, it } from "vitest";
import {
  buildCopilotUserPrompt,
  parseRawSuggestion,
  reconcileSuggestion,
  toAISource,
  type AISource,
  type RawModelSuggestion,
} from "@/modules/ai/domain";

function source(chunkId: string): AISource {
  return toAISource({
    chunkId,
    documentId: "doc",
    documentVersionId: "ver",
    documentTitle: "Estatuto",
    version: "1.0",
    status: "CURRENT",
    effectiveFrom: "2024-01-01",
    effectiveUntil: null,
    sourceNote: null,
    label: "Artículo 4",
    path: null,
    content: "texto",
  });
}

const raw = (overrides: Partial<RawModelSuggestion> = {}): RawModelSuggestion => ({
  issue: "Consulta",
  suggestedReply: "Hola",
  evidenceLevel: "SUFFICIENT",
  sourceIds: [],
  warnings: [],
  missingInformation: [],
  ...overrides,
});

describe("parseRawSuggestion", () => {
  it("accepts a valid object and trims text", () => {
    const parsed = parseRawSuggestion({ ...raw(), issue: "  Consulta  " });
    expect(parsed.issue).toBe("Consulta");
  });

  it("rejects non-objects, bad evidence levels and wrong array types", () => {
    expect(() => parseRawSuggestion("x")).toThrow();
    expect(() => parseRawSuggestion({ ...raw(), evidenceLevel: "HIGH" })).toThrow();
    expect(() => parseRawSuggestion({ ...raw(), sourceIds: [1] })).toThrow();
    expect(() => parseRawSuggestion({ ...raw(), suggestedReply: undefined })).toThrow();
  });
});

describe("reconcileSuggestion", () => {
  it("rebuilds sources from the retrieved chunks and keeps the model's level when sourced", () => {
    const result = reconcileSuggestion(raw({ sourceIds: ["a"], evidenceLevel: "PARTIAL" }), [source("a"), source("b")]);
    expect(result.sources.map((s) => s.chunkId)).toEqual(["a"]);
    expect(result.evidenceLevel).toBe("PARTIAL");
    expect(result.sources[0].documentTitle).toBe("Estatuto");
  });

  it("drops invented source ids, warns, and forces INSUFFICIENT when nothing real is left", () => {
    const result = reconcileSuggestion(raw({ sourceIds: ["invented"], evidenceLevel: "SUFFICIENT" }), [source("a")]);
    expect(result.sources).toEqual([]);
    expect(result.evidenceLevel).toBe("INSUFFICIENT");
    expect(result.warnings.some((w) => w.includes("no existe"))).toBe(true);
  });

  it("forces INSUFFICIENT when the model claims SUFFICIENT without any source", () => {
    expect(reconcileSuggestion(raw(), []).evidenceLevel).toBe("INSUFFICIENT");
  });

  it("collapses duplicate citations", () => {
    const result = reconcileSuggestion(raw({ sourceIds: ["a", "a"] }), [source("a")]);
    expect(result.sources).toHaveLength(1);
  });
});

describe("buildCopilotUserPrompt", () => {
  it("includes messages, cases, tasks and only the offered sources", () => {
    const prompt = buildCopilotUserPrompt({
      contactName: "Marta",
      contactNotes: null,
      channel: "whatsapp",
      messages: [{ direction: "INBOUND", body: "¿Cuántos días tengo?", at: new Date("2026-01-01T10:00:00Z") }],
      openCases: [{ title: "Baja", status: "OPEN", description: null }],
      pendingTasks: [{ title: "Llamar", dueDate: new Date("2026-02-01T00:00:00Z") }],
      knowledge: [{ ...source("chunk-1"), content: "Son 30 días." }],
    });
    expect(prompt).toContain("PERSONA: Marta");
    expect(prompt).toContain("PERSONA: ¿Cuántos días tengo?");
    expect(prompt).toContain("Baja [OPEN]");
    expect(prompt).toContain("vence 2026-02-01");
    expect(prompt).toContain('<fuente id="chunk-1"');
  });

  it("puts each knowledge fragment in the prompt complete (no 1000-char cut)", () => {
    const content = "x".repeat(1790);
    const prompt = buildCopilotUserPrompt({
      contactName: "Marta",
      contactNotes: null,
      channel: "whatsapp",
      messages: [],
      openCases: [],
      pendingTasks: [],
      knowledge: [{ ...source("c"), content }],
    });
    expect(prompt).toContain(content);
    expect(toAISource({ ...source("c"), chunkId: "c", content } as never).content).toBe(content);
  });

  it("states there is no knowledge when none was retrieved", () => {
    const prompt = buildCopilotUserPrompt({
      contactName: "Marta",
      contactNotes: null,
      channel: "whatsapp",
      messages: [],
      openCases: [],
      pendingTasks: [],
      knowledge: [],
    });
    expect(prompt).toContain("(ninguno recuperado)");
  });
});
