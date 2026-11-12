import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildDtcg, parseTokensCss, type DtcgColorToken, type DtcgTree } from "../../scripts/lib/tokens-dtcg";

/**
 * Spot-checks the DTCG export (docs/ui/TOKENS.md §3, scripts/export-tokens.ts)
 * against the same tables TOKENS.md §2 documents, so a future edit to
 * tokens.css that silently breaks the exporter's parsing fails here instead
 * of producing bad JSON someone imports into Figma without noticing.
 */

const root = path.resolve(import.meta.dirname, "../..");
const tokensCss = readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
const dtcg = buildDtcg(parseTokensCss(tokensCss));

function colorAt(tree: DtcgTree, ...path: string[]): string {
  let node: DtcgTree | DtcgColorToken = tree;
  for (const segment of path) {
    node = (node as DtcgTree)[segment] as DtcgTree | DtcgColorToken;
    if (!node) throw new Error(`No token at color.${path.join(".")} (missing segment "${segment}")`);
  }
  if (!("$type" in node) || node.$type !== "color") {
    throw new Error(`color.${path.join(".")} is not a leaf colour token`);
  }
  return (node as DtcgColorToken).$value;
}

describe("primitives.json", () => {
  it("resolves plain primitives to their hex value", () => {
    expect(colorAt(dtcg.primitives, "palette", "white")).toBe("#ffffff");
    expect(colorAt(dtcg.primitives, "palette", "ink", "900")).toBe("#101c33");
  });

  it("nests multi-segment primitive names (green-night-hover)", () => {
    expect(colorAt(dtcg.primitives, "palette", "green", "night", "hover")).toBe("#3bb090");
  });

  it("excludes --palette-shadow (a tint multiplier, not a usable colour)", () => {
    expect((dtcg.primitives.palette as DtcgTree).shadow).toBeUndefined();
  });
});

describe("semantic.light.json", () => {
  it("resolves a var() chain down to its primitive hex", () => {
    // --foreground: var(--palette-ink-900)
    expect(colorAt(dtcg.semanticLight, "color", "foreground", "DEFAULT")).toBe("#101c33");
    expect(colorAt(dtcg.semanticLight, "color", "foreground", "light")).toBe("#46556f");
  });

  it("gives a name that is both a leaf and a group prefix a DEFAULT child", () => {
    // --border and --border-strong/--border-control collide on the "border" path segment.
    expect(colorAt(dtcg.semanticLight, "color", "border", "DEFAULT")).toBe("#dde3ea");
    expect(colorAt(dtcg.semanticLight, "color", "border", "control")).toBe("#6f7c94");
  });

  it("resolves the translucent overlay (rgb(var(--palette-shadow) / alpha))", () => {
    // --overlay: rgb(var(--palette-shadow) / 0.36); palette-shadow = 16 28 51 = #101c33.
    // "overlay" has no sibling starting with "overlay-", so it stays a plain leaf (no DEFAULT wrapper).
    expect(colorAt(dtcg.semanticLight, "color", "overlay")).toBe("#101c335c");
  });

  it("exports radius as a DTCG dimension", () => {
    const card = (dtcg.semanticLight.radius as DtcgTree).card as { $type: string; $value: { value: number; unit: string } };
    expect(card.$type).toBe("dimension");
    expect(card.$value).toEqual({ value: 0.5, unit: "rem" });
  });

  it("exports a single-layer shadow as a one-element DTCG shadow array", () => {
    const xs = (dtcg.semanticLight.shadow as DtcgTree).xs as {
      $type: string;
      $value: Array<{ offsetY: { value: number; unit: string }; blur: { value: number; unit: string } }>;
    };
    expect(xs.$type).toBe("shadow");
    expect(xs.$value).toHaveLength(1);
    expect(xs.$value[0].offsetY).toEqual({ value: 1, unit: "px" });
    expect(xs.$value[0].blur).toEqual({ value: 2, unit: "px" });
  });

  it("exports a two-layer shadow (shadow-sm) as a two-element array with resolved colour", () => {
    const sm = (dtcg.semanticLight.shadow as DtcgTree).sm as {
      $value: Array<{ color: string; spread: { value: number; unit: string } }>;
    };
    expect(sm.$value).toHaveLength(2);
    // rgb(var(--palette-shadow) / 0.08) → #101c33 at alpha 0.08 (0.08*255 ≈ 20 = 0x14).
    expect(sm.$value[0].color).toBe("#101c3314");
    expect(sm.$value[1].spread).toEqual({ value: -1, unit: "px" });
  });
});

describe("semantic.dark.json", () => {
  it("redefines the same names with dark-theme values", () => {
    // :root[data-theme="dark"] --background: var(--palette-ink-950); --foreground: var(--palette-ink-50)
    expect(colorAt(dtcg.semanticDark, "color", "background", "DEFAULT")).toBe("#0a1222");
    expect(colorAt(dtcg.semanticDark, "color", "foreground", "DEFAULT")).toBe("#f5f7f9");
  });

  it("uses the dark theme's own accent, not the light one", () => {
    // light --primary is palette-green-600 (#15654a); dark --primary is palette-green-night (#34a37a).
    expect(colorAt(dtcg.semanticLight, "color", "primary", "DEFAULT")).toBe("#15654a");
    expect(colorAt(dtcg.semanticDark, "color", "primary", "DEFAULT")).toBe("#34a37a");
  });

  it("carries no radius/shadow of its own (those don't vary by theme)", () => {
    expect((dtcg.semanticDark as DtcgTree).radius).toBeUndefined();
    expect((dtcg.semanticDark as DtcgTree).shadow).toBeUndefined();
  });
});

describe("$themes.json", () => {
  it("maps both themes to their token sets", () => {
    const themes = dtcg.themes as Array<{ id: string; selectedTokenSets: Record<string, string> }>;
    expect(themes.map((theme) => theme.id)).toEqual(["light", "dark"]);
    expect(themes[0].selectedTokenSets).toEqual({ primitives: "source", "semantic.light": "enabled" });
    expect(themes[1].selectedTokenSets).toEqual({ primitives: "source", "semantic.dark": "enabled" });
  });
});
