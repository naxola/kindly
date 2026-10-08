import { describe, expect, it } from "vitest";
import { deriveIndexStatus, filterSources, formatCharacterCount, paginate, summarizeUsage, summarizeWebsite } from "@/modules/knowledge/source-status";

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

describe("summarizeWebsite", () => {
  it("counts each state and is done only when nothing is queued or being indexed", () => {
    const summary = summarizeWebsite([
      { status: "DISCOVERED" },
      { status: "INDEXED" },
      { status: "FAILED" },
      { status: "PENDING" },
      { status: "INDEXING" },
    ]);
    expect(summary).toEqual({ total: 5, discovered: 1, pending: 1, indexing: 1, indexed: 1, failed: 1, waiting: 2, done: false });
    expect(summarizeWebsite([{ status: "INDEXED" }, { status: "FAILED" }, { status: "DISCOVERED" }]).done).toBe(true);
    expect(summarizeWebsite([]).done).toBe(true);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 23 }, (_, i) => i + 1);

  it("returns one table page with its range and the page count", () => {
    expect(paginate(items, 0, 10)).toEqual({ rows: items.slice(0, 10), page: 0, pageCount: 3, from: 1, to: 10 });
    expect(paginate(items, 2, 10)).toEqual({ rows: [21, 22, 23], page: 2, pageCount: 3, from: 21, to: 23 });
  });

  it("clamps an out-of-range page, e.g. after a filter shrinks the list", () => {
    expect(paginate(items, 9, 10).page).toBe(2);
    expect(paginate(items, -3, 10).page).toBe(0);
  });

  it("handles an empty list", () => {
    expect(paginate([], 0, 10)).toEqual({ rows: [], page: 0, pageCount: 1, from: 0, to: 0 });
  });
});
