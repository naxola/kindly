import { describe, expect, it } from "vitest";
import {
  articleNumber,
  buildSearchText,
  detectApartados,
  normalizeLegalReferences,
} from "@/modules/knowledge/indexing";

/** Fase 8, paso 1: what a chunk is indexed/embedded as, and query normalization. Pure. */

describe("articleNumber", () => {
  it("prefers the label, falls back to the breadcrumb's last article", () => {
    expect(articleNumber("Título I > Artículo 34", "Artículo 34 (parte 2)")).toBe("34");
    expect(articleNumber("Título I > Capítulo II > Artículo 12", null)).toBe("12");
    expect(articleNumber("Título I > Capítulo II", "Capítulo II")).toBeNull();
    expect(articleNumber(null, null)).toBeNull();
  });
});

describe("detectApartados", () => {
  it("trusts numbers at the start of a line", () => {
    const content = "1. La duración de la jornada.\n2. Se podrá establecer.\n8. Las personas trabajadoras tienen derecho.";
    expect(detectApartados(content).map((m) => m.value)).toEqual(["1", "2", "8"]);
  });

  it("accepts inline numbers only as a consecutive run (collapsed PDF text)", () => {
    const content = "Artículo collapsed. 7. Texto siete. 8. Texto ocho. Desde 2024. Otro texto.";
    expect(detectApartados(content).map((m) => m.value)).toEqual(["7", "8"]);
  });

  it("ignores a lone inline number", () => {
    expect(detectApartados("Aprobado en 2024. Entra en vigor mañana.")).toEqual([]);
  });
});

describe("buildSearchText", () => {
  const content = [
    "8. Las personas trabajadoras tienen derecho a solicitar las adaptaciones de la jornada:",
    "a) para hacer efectivo su derecho a la conciliación;",
    "b) hasta que los hijos cumplan doce años.",
  ].join("\n");

  it("prefixes the full hierarchy, apartados and subapartados, then the complete content", () => {
    const text = buildSearchText({
      documentTitle: "Estatuto de los Trabajadores",
      path: "Título I > Capítulo II > Sección 5 > Artículo 34",
      label: "Artículo 34 (parte 3)",
      content,
    });
    expect(text).toContain("Documento: Estatuto de los Trabajadores");
    expect(text).toContain("Ubicación: Título I > Capítulo II > Sección 5 > Artículo 34");
    expect(text).toContain("Fragmento: Artículo 34 (parte 3)");
    expect(text).toContain("Artículo 34, apartado 8 (art. 34.8)");
    expect(text).toContain("art. 34.8.a");
    expect(text).toContain("art. 34.8.b");
    expect(text.endsWith(`\n\n${content}`)).toBe(true);
  });

  it("does not repeat the label when it equals the breadcrumb's last segment", () => {
    const text = buildSearchText({ documentTitle: "Ley", path: "Artículo 5", label: "Artículo 5", content: "Texto." });
    expect(text).not.toContain("Fragmento:");
  });

  it("emits no apartado references without an article (e.g. an internal manual)", () => {
    const text = buildSearchText({ documentTitle: "Manual", path: null, label: null, content: "1. Abrir.\n2. Cerrar." });
    expect(text).toBe("Documento: Manual\n\n1. Abrir.\n2. Cerrar.");
  });
});

describe("normalizeLegalReferences", () => {
  it("expands 'art.' to 'artículo'", () => {
    expect(normalizeLegalReferences("¿Qué dice el art. 34.8?")).toBe("¿Qué dice el artículo 34.8?");
    expect(normalizeLegalReferences("art 12")).toBe("artículo 12");
  });

  it("adds the compact token for 'artículo N apartado M' in either order", () => {
    expect(normalizeLegalReferences("artículo 34 apartado 8")).toContain("34.8");
    expect(normalizeLegalReferences("art. 34, apdo. 8")).toContain("34.8");
    expect(normalizeLegalReferences("el apartado 8 del artículo 34")).toContain("34.8");
  });

  it("leaves unrelated words alone", () => {
    expect(normalizeLegalReferences("partes del contrato")).toBe("partes del contrato");
  });
});
