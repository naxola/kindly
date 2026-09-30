import { describe, expect, it } from "vitest";
import { chunkDocumentText } from "@/modules/knowledge/ingestion/chunking";

/**
 * Unit tests for the pure structural chunker (Fase 7b, `docs/DATABASE.md`
 * §14). No DB, no I/O.
 */

describe("chunkDocumentText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkDocumentText("")).toEqual([]);
    expect(chunkDocumentText("   \n  \n")).toEqual([]);
  });

  it("recognizes CAPÍTULO/ARTÍCULO and builds a breadcrumb", () => {
    const text = [
      "CAPÍTULO I",
      "Disposiciones generales",
      "",
      "Artículo 1",
      "Esta ley regula la materia de extranjería.",
      "",
      "Artículo 2",
      "Se aplicará en todo el territorio nacional.",
    ].join("\n");

    const chunks = chunkDocumentText(text);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({
      ordinal: 0,
      level: "CHAPTER",
      label: "Capítulo I",
      path: "Capítulo I",
      content: "Disposiciones generales",
    });
    expect(chunks[1]).toMatchObject({
      ordinal: 1,
      level: "ARTICLE",
      label: "Artículo 1",
      path: "Capítulo I > Artículo 1",
      content: "Esta ley regula la materia de extranjería.",
    });
    expect(chunks[2]).toMatchObject({
      ordinal: 2,
      level: "ARTICLE",
      label: "Artículo 2",
      path: "Capítulo I > Artículo 2",
      content: "Se aplicará en todo el territorio nacional.",
    });
  });

  it("keeps TÍTULO in the breadcrumb without giving it its own chunk level", () => {
    const text = ["TÍTULO I", "CAPÍTULO I", "Artículo 1", "Contenido del artículo."].join("\n");

    const chunks = chunkDocumentText(text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      level: "ARTICLE",
      path: "Título I > Capítulo I > Artículo 1",
    });
  });

  it("resets deeper context when a shallower heading appears", () => {
    const text = [
      "CAPÍTULO I",
      "Sección 1",
      "Artículo 1",
      "Primero.",
      "CAPÍTULO II",
      "Artículo 2",
      "Segundo.",
    ].join("\n");

    const chunks = chunkDocumentText(text);

    expect(chunks.map((c) => c.path)).toEqual([
      "Capítulo I > Sección 1 > Artículo 1",
      "Capítulo II > Artículo 2",
    ]);
  });

  it("keeps text on the heading's own line as body content, not as the label", () => {
    const text = "Artículo 5. A los efectos de esta ley se entenderá por residente legal...";
    const chunks = chunkDocumentText(text);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].label).toBe("Artículo 5");
    expect(chunks[0].content).toBe("A los efectos de esta ley se entenderá por residente legal...");
  });

  it("splits an oversized article into PARAGRAPH-level chunks sharing the same path/label", () => {
    const paragraphA = "A".repeat(1000);
    const paragraphB = "B".repeat(1000);
    const text = ["Artículo 1", paragraphA, "", paragraphB].join("\n");

    const chunks = chunkDocumentText(text);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ level: "PARAGRAPH", path: "Artículo 1", content: paragraphA });
    expect(chunks[1]).toMatchObject({ level: "PARAGRAPH", path: "Artículo 1", content: paragraphB });
    expect(chunks[0].label).toContain("Artículo 1");
    expect(chunks[0].label).not.toBe(chunks[1].label);
  });

  it("splits an oversized single paragraph into FRAGMENT-level, size-bounded pieces", () => {
    const longParagraph = Array.from({ length: 400 }, (_, i) => `palabra${i}`).join(" ");
    const text = ["Artículo 1", longParagraph].join("\n");

    const chunks = chunkDocumentText(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.level).toBe("FRAGMENT");
      expect(chunk.content.length).toBeLessThanOrEqual(1800);
      expect(chunk.path).toBe("Artículo 1");
    }
    // Nothing lost: reassembling the pieces recovers every word.
    expect(chunks.map((c) => c.content).join(" ")).toBe(longParagraph);
  });

  it("falls back to FRAGMENT chunks, by size, for text with no recognized structure", () => {
    const text = "Este es un manual interno sin estructura legal reconocible. ".repeat(60);

    const chunks = chunkDocumentText(text);

    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.level).toBe("FRAGMENT");
      expect(chunk.label).toBeNull();
      expect(chunk.path).toBeNull();
    }
  });

  it("keeps short unstructured text as a single FRAGMENT chunk", () => {
    const chunks = chunkDocumentText("Un párrafo corto sin estructura.");
    expect(chunks).toEqual([
      { ordinal: 0, level: "FRAGMENT", label: null, path: null, content: "Un párrafo corto sin estructura." },
    ]);
  });

  it("assigns strictly increasing, contiguous ordinals across headings", () => {
    const text = ["Artículo 1", "Uno.", "Artículo 2", "Dos.", "Artículo 3", "Tres."].join("\n");
    const chunks = chunkDocumentText(text);
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2]);
  });

  it("drops a heading with nothing after it and nothing before the next one", () => {
    const text = ["Artículo 1", "Artículo 2", "Contenido."].join("\n");
    const chunks = chunkDocumentText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ path: "Artículo 2", content: "Contenido." });
  });
});
