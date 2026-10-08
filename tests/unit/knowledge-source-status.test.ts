import { describe, expect, it } from "vitest";
import { deriveIndexStatus, filterSources, formatCharacterCount, summarizeImport, summarizeUsage } from "@/modules/knowledge/source-status";

describe("deriveIndexStatus", () => {
  it("is EMPTY without chunks, whatever the provider", () => {
    expect(deriveIndexStatus({ chunkCount: 0, staleChunkCount: 0, providerKnown: true })).toBe("EMPTY");
    expect(deriveIndexStatus({ chunkCount: 0, staleChunkCount: 0, providerKnown: false })).toBe("EMPTY");
  });

  it("is UNKNOWN when no provider is registered", () => {
    expect(deriveIndexStatus({ chunkCount: 3, staleChunkCount: 0, providerKnown: false })).toBe("UNKNOWN");
  });

  it("is OUTDATED when any chunk was embedded by another model", () => {
    expect(deriveIndexStatus({ chunkCount: 3, staleChunkCount: 1, providerKnown: true })).toBe("OUTDATED");
    expect(deriveIndexStatus({ chunkCount: 3, staleChunkCount: 3, providerKnown: true })).toBe("OUTDATED");
  });

  it("is INDEXED when every chunk matches the active provider", () => {
    expect(deriveIndexStatus({ chunkCount: 3, staleChunkCount: 0, providerKnown: true })).toBe("INDEXED");
  });
});

describe("formatCharacterCount", () => {
  it("groups thousands the Spanish way, also below 10.000", () => {
    expect(formatCharacterCount(1234)).toBe("1.234");
    expect(formatCharacterCount(1234567)).toBe("1.234.567");
    expect(formatCharacterCount(0)).toBe("0");
  });
});

describe("summarizeUsage", () => {
  it("counts only the organization's own sources, not public ones", () => {
    expect(
      summarizeUsage([
        { visibility: "ORGANIZATION", chunkCount: 2, characterCount: 100 },
        { visibility: "ORGANIZATION", chunkCount: 3, characterCount: 50 },
        { visibility: "GLOBAL", chunkCount: 99, characterCount: 9999 },
      ]),
    ).toEqual({ sourceCount: 2, chunkCount: 5, characterCount: 150 });
  });

  it("is all zero without sources", () => {
    expect(summarizeUsage([])).toEqual({ sourceCount: 0, chunkCount: 0, characterCount: 0 });
  });
});

describe("filterSources", () => {
  const sources = [
    { title: "Reglamento de Extranjería", sourceType: "PDF" },
    { title: "Guía de citas", sourceType: "WEB" },
    { title: "Notas internas", sourceType: "MANUAL" },
  ];

  it("returns everything without filters", () => {
    expect(filterSources(sources, {})).toHaveLength(3);
  });

  it("matches the title ignoring case and accents", () => {
    expect(filterSources(sources, { text: "extranjeria" }).map((s) => s.title)).toEqual(["Reglamento de Extranjería"]);
    expect(filterSources(sources, { text: "  GUIA " }).map((s) => s.title)).toEqual(["Guía de citas"]);
  });

  it("filters by exact type and combines with text", () => {
    expect(filterSources(sources, { type: "WEB" })).toHaveLength(1);
    expect(filterSources(sources, { type: "WEB", text: "notas" })).toHaveLength(0);
  });
});

describe("summarizeImport", () => {
  it("counts each state and is done only when nothing is waiting or indexing", () => {
    const summary = summarizeImport([
      { status: "INDEXED" },
      { status: "FAILED" },
      { status: "SKIPPED" },
      { status: "PENDING" },
      { status: "INDEXING" },
    ]);
    expect(summary).toEqual({ total: 5, pending: 1, indexing: 1, indexed: 1, failed: 1, skipped: 1, done: false });
    expect(summarizeImport([{ status: "INDEXED" }, { status: "FAILED" }]).done).toBe(true);
    expect(summarizeImport([]).done).toBe(true);
  });
});
