import { describe, expect, it } from "vitest";
import { parseIngestArgs } from "../../scripts/lib/knowledge-ingest-args";

/**
 * Unit tests for `scripts/ingest-knowledge.ts`'s argv parsing/validation
 * (Fase 7b). Pure — no fs, no network, no DB.
 */

const BASE = [
  "--title",
  "Ley de Extranjería",
  "--visibility",
  "GLOBAL",
  "--version",
  "1.0",
  "--effective-from",
  "2024-01-01",
  "--pdf",
  "./ley.pdf",
];

describe("parseIngestArgs", () => {
  it("parses a minimal valid GLOBAL document", () => {
    const args = parseIngestArgs(BASE);
    expect(args).toMatchObject({
      documentId: null,
      title: "Ley de Extranjería",
      visibility: "GLOBAL",
      organizationId: null,
      version: "1.0",
      status: "CURRENT",
      effectiveFrom: "2024-01-01",
      effectiveUntil: null,
      input: { type: "PDF", location: "./ley.pdf" },
      provider: "openai",
    });
  });

  it("requires --org with --visibility ORGANIZATION", () => {
    const args = [...BASE.slice(0, 2), "--visibility", "ORGANIZATION", ...BASE.slice(4)];
    expect(() => parseIngestArgs(args)).toThrow(/--org is required/);
  });

  it("rejects --org together with --visibility GLOBAL", () => {
    const args = [...BASE, "--org", "11111111-1111-1111-1111-111111111111"];
    expect(() => parseIngestArgs(args)).toThrow(/must not be passed with --visibility GLOBAL/);
  });

  it("accepts ORGANIZATION visibility with --org", () => {
    const args = [
      "--title",
      "Manual interno",
      "--visibility",
      "ORGANIZATION",
      "--org",
      "11111111-1111-1111-1111-111111111111",
      "--version",
      "1.0",
      "--effective-from",
      "2024-01-01",
      "--pdf",
      "./manual.pdf",
    ];
    const parsed = parseIngestArgs(args);
    expect(parsed.visibility).toBe("ORGANIZATION");
    expect(parsed.organizationId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("requires --title/--visibility unless --document-id is given", () => {
    expect(() => parseIngestArgs(BASE.slice(2))).toThrow(/Missing --title/);
  });

  it("rejects combining --document-id with --title/--visibility/--org", () => {
    const args = ["--document-id", "doc-1", ...BASE];
    expect(() => parseIngestArgs(args)).toThrow(/don't combine it with/);
  });

  it("accepts --document-id alone, without --title/--visibility", () => {
    const args = ["--document-id", "doc-1", "--version", "2.0", "--effective-from", "2025-01-01", "--url", "https://example.org"];
    const parsed = parseIngestArgs(args);
    expect(parsed.documentId).toBe("doc-1");
    expect(parsed.title).toBeNull();
    expect(parsed.input).toEqual({ type: "URL", url: "https://example.org" });
  });

  it("requires exactly one source flag (rejects zero)", () => {
    expect(() => parseIngestArgs(BASE.slice(0, 8))).toThrow(/Exactly one of --pdf, --url or --text-file/);
  });

  it("requires exactly one source flag (rejects two)", () => {
    const args = [...BASE, "--url", "https://example.org"];
    expect(() => parseIngestArgs(args)).toThrow(/Exactly one of --pdf, --url or --text-file/);
  });

  it("rejects a malformed --effective-from", () => {
    const args = [...BASE.slice(0, 6), "--effective-from", "01/01/2024", ...BASE.slice(8)];
    expect(() => parseIngestArgs(args)).toThrow(/Invalid --effective-from/);
  });

  it("rejects a malformed --effective-until", () => {
    const args = [...BASE, "--effective-until", "not-a-date"];
    expect(() => parseIngestArgs(args)).toThrow(/Invalid --effective-until/);
  });

  it("rejects an invalid --status", () => {
    const args = [...BASE, "--status", "ACTIVE"];
    expect(() => parseIngestArgs(args)).toThrow(/Invalid --status/);
  });

  it("rejects an invalid --provider", () => {
    const args = [...BASE, "--provider", "anthropic"];
    expect(() => parseIngestArgs(args)).toThrow(/Invalid --provider/);
  });

  it("requires --provider fake to be passed explicitly (defaults to openai)", () => {
    expect(parseIngestArgs(BASE).provider).toBe("openai");
    const args = [...BASE, "--provider", "fake"];
    expect(parseIngestArgs(args).provider).toBe("fake");
  });

  it("rejects an unknown flag", () => {
    const args = [...BASE, "--bogus", "value"];
    expect(() => parseIngestArgs(args)).toThrow(/Unknown flag: --bogus/);
  });

  it("rejects a flag passed without a value", () => {
    const args = [...BASE, "--jurisdiction"];
    expect(() => parseIngestArgs(args)).toThrow(/requires a value/);
  });

  it("rejects a flag passed more than once", () => {
    const args = [...BASE, "--title", "Otro título"];
    expect(() => parseIngestArgs(args)).toThrow(/more than once/);
  });

  it("parses optional metadata flags", () => {
    const args = [
      ...BASE,
      "--source-note",
      "BOE núm. 5, de 2024-01-10",
      "--jurisdiction",
      "ES",
      "--territory",
      "Nacional",
      "--scope",
      "Extranjería",
    ];
    const parsed = parseIngestArgs(args);
    expect(parsed.sourceNote).toBe("BOE núm. 5, de 2024-01-10");
    expect(parsed.jurisdiction).toBe("ES");
    expect(parsed.territory).toBe("Nacional");
    expect(parsed.scope).toBe("Extranjería");
  });
});
