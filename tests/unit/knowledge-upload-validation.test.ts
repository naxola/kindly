import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_PDF_BYTES,
  MAX_TEXT_BYTES,
  parseDocumentFields,
  parseVersionFields,
  resolveUploadedSource,
  validatePdf,
  validateTextFile,
  validateWebUrl,
} from "@/modules/knowledge/ingestion/upload-validation";

const samplePdf = new Uint8Array(readFileSync(path.resolve(__dirname, "../fixtures/knowledge/sample.pdf")));
const bytes = (s: string) => new TextEncoder().encode(s);

function form(entries: Record<string, string | File>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("validatePdf", () => {
  it("accepts a real PDF", () => {
    expect(validatePdf(samplePdf.length, samplePdf).ok).toBe(true);
  });
  it("rejects a file that is not a PDF even if named .pdf", () => {
    expect(validatePdf(5, bytes("hello"))).toEqual({ ok: false, error: "El archivo no es un PDF válido." });
  });
  it("rejects empty and oversized files", () => {
    expect(validatePdf(0, new Uint8Array()).ok).toBe(false);
    expect(validatePdf(MAX_PDF_BYTES + 1, samplePdf).ok).toBe(false);
  });
});

describe("validateTextFile", () => {
  it("decodes UTF-8", () => {
    expect(validateTextFile(9, bytes("Artículo"))).toEqual({ ok: true, value: "Artículo" });
  });
  it("rejects binary content (NUL bytes) and invalid UTF-8", () => {
    expect(validateTextFile(3, new Uint8Array([65, 0, 66])).ok).toBe(false);
    expect(validateTextFile(2, new Uint8Array([0xff, 0xfe])).ok).toBe(false);
  });
  it("rejects empty and oversized files", () => {
    expect(validateTextFile(0, new Uint8Array()).ok).toBe(false);
    expect(validateTextFile(MAX_TEXT_BYTES + 1, bytes("x")).ok).toBe(false);
  });
});

describe("validateWebUrl", () => {
  it("accepts http(s) and normalizes", () => {
    expect(validateWebUrl(" https://www.boe.es/a ")).toEqual({ ok: true, value: "https://www.boe.es/a" });
  });
  it.each(["file:///etc/passwd", "ftp://x.org", "javascript:alert(1)", "no es url", "https://user:pw@x.org/"])(
    "rejects %s",
    (raw) => {
      expect(validateWebUrl(raw).ok).toBe(false);
    },
  );
});

describe("parseVersionFields", () => {
  const base = { version: "2024", effectiveFrom: "2024-01-10", origin: "TEXT" };

  it("parses a valid form with defaults", () => {
    const result = parseVersionFields(form(base));
    expect(result).toMatchObject({ ok: true, value: { version: "2024", status: "CURRENT", effectiveUntil: null } });
  });
  it("rejects impossible dates, inverted vigencia, unknown status/origin", () => {
    expect(parseVersionFields(form({ ...base, effectiveFrom: "2024-02-31" })).ok).toBe(false);
    expect(parseVersionFields(form({ ...base, effectiveUntil: "2023-12-31" })).ok).toBe(false);
    expect(parseVersionFields(form({ ...base, status: "REPEALED" })).ok).toBe(false);
    expect(parseVersionFields(form({ ...base, origin: "FTP" })).ok).toBe(false);
    expect(parseVersionFields(form({ ...base, version: "  " })).ok).toBe(false);
  });
});

describe("parseDocumentFields", () => {
  it("requires a title and trims optional metadata", () => {
    expect(parseDocumentFields(form({ title: " " })).ok).toBe(false);
    expect(parseDocumentFields(form({ title: "Ley", jurisdiction: " ES " }))).toMatchObject({
      ok: true,
      value: { title: "Ley", jurisdiction: "ES", territory: null },
    });
  });
});

describe("resolveUploadedSource", () => {
  it("requires a file for PDF/TEXT origins", async () => {
    const fields = parseVersionFields(form({ version: "1", effectiveFrom: "2024-01-01", origin: "PDF" }));
    if (!fields.ok) throw new Error("setup");
    expect(await resolveUploadedSource(fields.value)).toEqual({ ok: false, error: "Selecciona un archivo." });
  });
  it("reads and validates an uploaded PDF", async () => {
    const fields = parseVersionFields(
      form({ version: "1", effectiveFrom: "2024-01-01", origin: "PDF", file: new File([samplePdf], "ley.pdf") }),
    );
    if (!fields.ok) throw new Error("setup");
    expect((await resolveUploadedSource(fields.value)).ok).toBe(true);
  });
  it("rejects a text file uploaded as PDF", async () => {
    const fields = parseVersionFields(
      form({ version: "1", effectiveFrom: "2024-01-01", origin: "PDF", file: new File(["hola"], "ley.pdf") }),
    );
    if (!fields.ok) throw new Error("setup");
    expect((await resolveUploadedSource(fields.value)).ok).toBe(false);
  });
  it("validates the URL for WEB origin", async () => {
    const fields = parseVersionFields(
      form({ version: "1", effectiveFrom: "2024-01-01", origin: "WEB", url: "file:///etc/passwd" }),
    );
    if (!fields.ok) throw new Error("setup");
    expect((await resolveUploadedSource(fields.value)).ok).toBe(false);
  });
});
