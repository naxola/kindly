import { describe, expect, it } from "vitest";
import { toSuggestionDto } from "@/modules/ai/dto";
import type { AISuggestion } from "@/modules/ai/domain";

const suggestion: AISuggestion = {
  outcome: "GROUNDED",
  knowledgeStatus: "OK",
  issue: "Consulta sobre jornada",
  suggestedReply: "Hola",
  evidenceLevel: "PARTIAL",
  sources: [
    {
      chunkId: "c1",
      documentId: "d1",
      documentVersionId: "v1",
      documentTitle: "Estatuto",
      version: "2024",
      status: "CURRENT",
      effectiveFrom: "2024-01-01",
      effectiveUntil: null,
      sourceNote: "BOE",
      label: "Artículo 34",
      path: "Título I > Artículo 34",
      content: "Texto completo",
    },
  ],
  warnings: ["Revisar plazo"],
  missingInformation: [],
};

const row = (overrides = {}) => ({
  id: "s1",
  status: "GENERATED" as const,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  resolvedAt: null,
  triggerMessageId: "m1",
  suggestion,
  ...overrides,
});

describe("toSuggestionDto", () => {
  it("exposes the suggestion and its sources with their validity and location", () => {
    const dto = toSuggestionDto(row(), "m1");
    expect(dto).toMatchObject({ id: "s1", outcome: "GROUNDED", evidenceLevel: "PARTIAL", hasNewerMessage: false });
    expect(dto.sources[0]).toMatchObject({ validFrom: "2024-01-01", validUntil: null, location: "Título I > Artículo 34" });
  });

  it("says when a newer inbound message arrived after the one answered", () => {
    expect(toSuggestionDto(row(), "m2").hasNewerMessage).toBe(true);
    expect(toSuggestionDto(row(), null).hasNewerMessage).toBe(false);
  });

  it("shapes a failed generation without a suggestion", () => {
    const dto = toSuggestionDto(row({ status: "FAILED", suggestion: null }), "m1");
    expect(dto).toMatchObject({ status: "FAILED", outcome: null, suggestedReply: "", sources: [] });
  });

  it("never leaks the provider, model, prompt or retrieval trace — even if the row carries them", () => {
    const leaky = row({
      providerId: "openai",
      model: "gpt-5.4-mini",
      contextSnapshot: { systemPrompt: "SECRET-PROMPT", userPrompt: "SECRET-USER", retrieval: { query: "q" } },
      requestedBy: "user-1",
    });
    const json = JSON.stringify(toSuggestionDto(leaky, "m1"));
    for (const forbidden of ["openai", "gpt-5.4-mini", "SECRET-PROMPT", "SECRET-USER", "retrieval", "providerId", "model", "contextSnapshot"]) {
      expect(json).not.toContain(forbidden);
    }
  });
});
