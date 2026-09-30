/**
 * Parses src/styles/tokens.css and resolves every color/radius/shadow token
 * down to a flat value, then shapes that into W3C DTCG (Design Tokens
 * Community Group) JSON — the format Tokens Studio and the Figma Variables
 * REST API both import (docs/ui/TOKENS.md §3).
 *
 * Only color, radius and shadow are covered: those are the values Figma
 * Variables needs as plain data (typography/dimensions/z-index stay as CSS
 * — TOKENS.md §3 only promises a Figma sync for color/radius/shadow).
 *
 * Parsing follows the same proven pattern as
 * tests/unit/ui-tokens.test.ts::resolveDarkTokens: `:root { ... }` and
 * `:root[data-theme="dark"] { ... }` are flat declarations with no nested
 * braces, so a non-greedy match up to the first `}` is safe. This module
 * additionally resolves the `rgb(... / alpha)` shapes those two functions
 * don't need (nothing in the WCAG contrast pairs they check is translucent).
 */

export interface DtcgColorToken {
  $type: "color";
  $value: string;
}

export interface DtcgDimensionToken {
  $type: "dimension";
  $value: { value: number; unit: "rem" | "px" };
}

export interface DtcgShadowLayer {
  color: string;
  offsetX: { value: number; unit: "rem" | "px" };
  offsetY: { value: number; unit: "rem" | "px" };
  blur: { value: number; unit: "rem" | "px" };
  spread: { value: number; unit: "rem" | "px" };
}

export interface DtcgShadowToken {
  $type: "shadow";
  $value: DtcgShadowLayer[];
}

export type DtcgToken = DtcgColorToken | DtcgDimensionToken | DtcgShadowToken;
export type DtcgTree = { [key: string]: DtcgTree | DtcgToken };

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseBlock(source: string): Map<string, string> {
  const raw = new Map<string, string>();
  for (const match of source.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    if (!raw.has(match[1])) raw.set(match[1], match[2].trim());
  }
  return raw;
}

/** The one root block that isn't `:root { ... }` or `:root[data-theme="dark"] { ... }`. */
function paletteShadowTriplet(primitives: Map<string, string>): [number, number, number] {
  const value = primitives.get("--palette-shadow");
  const match = value?.match(/^(\d+)\s+(\d+)\s+(\d+)$/);
  if (!match) throw new Error("Could not find --palette-shadow (expected a bare \"R G B\" triplet)");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function hexToRgba(hex: string): Rgba {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}

function formatRgba({ r, g, b, a }: Rgba): string {
  const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return a >= 1 ? base : `${base}${hex2(a * 255)}`;
}

/**
 * Resolves a raw declaration value to a flat colour: chases `var(--x)`
 * chains through `all` (primitives + the theme's own block), and expands
 * `rgb(var(--palette-shadow) / a)` / `rgb(r g b / a)` into rgba.
 */
function resolveColor(raw: string, all: Map<string, string>, shadowTriplet: [number, number, number]): Rgba {
  const resolve = (value: string, depth: number): Rgba => {
    if (depth > 10) throw new Error(`Token reference too deep resolving "${raw}"`);
    const trimmed = value.trim();

    const varRef = trimmed.match(/^var\((--[a-z0-9-]+)\)$/);
    if (varRef) {
      const next = all.get(varRef[1]);
      if (next === undefined) throw new Error(`Unresolvable token ${varRef[1]} (referenced from "${raw}")`);
      return resolve(next, depth + 1);
    }

    const rgbShadow = trimmed.match(/^rgba?\(var\(--palette-shadow\)\s*\/\s*([\d.]+)\)$/);
    if (rgbShadow) {
      const [r, g, b] = shadowTriplet;
      return { r, g, b, a: Number(rgbShadow[1]) };
    }

    const rgbLiteral = trimmed.match(/^rgba?\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/);
    if (rgbLiteral) {
      return { r: Number(rgbLiteral[1]), g: Number(rgbLiteral[2]), b: Number(rgbLiteral[3]), a: Number(rgbLiteral[4]) };
    }

    return hexToRgba(trimmed);
  };
  return resolve(raw, 0);
}

function parseDimension(raw: string): { value: number; unit: "rem" | "px" } {
  const trimmed = raw.trim();
  if (trimmed === "0") return { value: 0, unit: "px" };
  const match = trimmed.match(/^(-?[\d.]+)(rem|px)$/);
  if (!match) throw new Error(`Not a plain rem/px dimension: ${raw}`);
  return { value: Number(match[1]), unit: match[2] as "rem" | "px" };
}

/** Splits a (possibly multi-layer) box-shadow value on its top-level commas. Safe here because
 * every colour function in tokens.css uses the modern space+slash syntax (`rgb(r g b / a)`),
 * so no comma ever appears inside a nested `(...)`. */
function splitShadowLayers(raw: string): string[] {
  return raw.split(",").map((layer) => layer.trim());
}

/** `rgb(var(--palette-shadow) / 0.05)` nests a `var(...)` inside the colour function, so a naive
 * `[^)]*` regex stops at the wrong `)`. Finds the last top-level `rgb(`/`rgba(` and walks forward
 * counting paren depth to its true matching close, which is always the end of the layer string. */
function splitShadowLayerColor(layer: string): { lengths: string; color: string } {
  const open = layer.search(/rgba?\(/);
  if (open === -1) throw new Error(`Shadow layer has no colour function: ${layer}`);
  let depth = 0;
  for (let i = open; i < layer.length; i++) {
    if (layer[i] === "(") depth++;
    else if (layer[i] === ")" && --depth === 0) {
      return { lengths: layer.slice(0, open).trim(), color: layer.slice(open, i + 1) };
    }
  }
  throw new Error(`Unbalanced parens in shadow layer: ${layer}`);
}

function parseShadowLayer(layer: string, all: Map<string, string>, shadowTriplet: [number, number, number]): DtcgShadowLayer {
  const { lengths, color: rawColor } = splitShadowLayerColor(layer);
  const color = formatRgba(resolveColor(rawColor, all, shadowTriplet));
  const parsed = lengths.split(/\s+/).map(parseDimension);
  const [offsetX, offsetY, blur, spread = { value: 0, unit: "px" as const }] = parsed;
  return { color, offsetX, offsetY, blur, spread };
}

export interface ParsedTokens {
  primitives: Map<string, string>;
  semanticLight: Map<string, string>;
  semanticDark: Map<string, string>;
  radius: Map<string, string>;
  shadow: Map<string, string>;
}

export function parseTokensCss(css: string): ParsedTokens {
  const rootBlocks = [...css.matchAll(/:root\s*{([^}]*)}/g)];
  const darkBlock = css.match(/:root\[data-theme="dark"\]\s*{([^}]*)}/);
  if (rootBlocks.length < 2 || !darkBlock) {
    throw new Error("Could not find the primitives, light-theme or dark-theme block in tokens.css");
  }
  const primitives = parseBlock(rootBlocks[0][1]);
  const semanticLightAll = parseBlock(rootBlocks[1][1]);
  const semanticDark = parseBlock(darkBlock[1]);

  // The dark block only ever redefines colour tokens (never dimensions/z-index/motion),
  // so intersecting with it is exactly the light block's colour subset.
  const semanticLight = new Map([...semanticLightAll].filter(([name]) => semanticDark.has(name)));

  const radius = new Map<string, string>();
  for (const match of css.matchAll(/--radius-([a-z0-9]+):\s*([^;]+);/g)) radius.set(match[1], match[2].trim());
  const shadow = new Map<string, string>();
  for (const match of css.matchAll(/--shadow-([a-z0-9]+):\s*([^;]+);/g)) shadow.set(match[1], match[2].trim());

  return { primitives, semanticLight, semanticDark, radius, shadow };
}

/** Builds `<name-without-prefix>` split on "-" into a nested DTCG path, e.g. "foreground-light" → color.foreground.light. A
 * name that is simultaneously a leaf and a group prefix (`--border` vs `--border-strong`) gets a `DEFAULT` child — the
 * standard Style Dictionary/Tailwind convention for that exact collision. */
function setPath(tree: DtcgTree, segments: string[], token: DtcgToken): void {
  if (segments.length === 1) {
    const existing = tree[segments[0]];
    if (existing && !("$value" in existing)) {
      (existing as DtcgTree).DEFAULT = token;
    } else {
      tree[segments[0]] = token;
    }
    return;
  }
  const [head, ...rest] = segments;
  const existing = tree[head];
  if (existing && "$value" in existing) {
    tree[head] = { DEFAULT: existing as DtcgToken };
  } else if (!existing) {
    tree[head] = {};
  }
  setPath(tree[head] as DtcgTree, rest, token);
}

function colorGroup(names: Map<string, string>, all: Map<string, string>, shadowTriplet: [number, number, number]): DtcgTree {
  const tree: DtcgTree = {};
  for (const [name] of names) {
    const raw = all.get(name)!;
    const segments = name.replace(/^--/, "").split("-");
    setPath(tree, segments, { $type: "color", $value: formatRgba(resolveColor(raw, all, shadowTriplet)) });
  }
  return tree;
}

export interface DtcgExport {
  primitives: DtcgTree;
  semanticLight: DtcgTree;
  semanticDark: DtcgTree;
  themes: unknown;
}

export function buildDtcg(parsed: ParsedTokens): DtcgExport {
  const shadowTriplet = paletteShadowTriplet(parsed.primitives);
  const allLight = new Map([...parsed.primitives, ...parsed.semanticLight]);
  const allDark = new Map([...parsed.primitives, ...parsed.semanticDark]);

  const primitivesTree: DtcgTree = { palette: {} };
  for (const [name, raw] of parsed.primitives) {
    if (name === "--palette-shadow") continue; // a tint multiplier, not a usable standalone colour.
    const segments = name.replace(/^--palette-/, "").split("-");
    setPath(primitivesTree.palette as DtcgTree, segments, {
      $type: "color",
      $value: formatRgba(resolveColor(raw, parsed.primitives, shadowTriplet)),
    });
  }

  const radiusTree: DtcgTree = { radius: {} };
  for (const [name, raw] of parsed.radius) {
    (radiusTree.radius as DtcgTree)[name] = { $type: "dimension", $value: parseDimension(raw) };
  }

  const shadowTree: DtcgTree = { shadow: {} };
  for (const [name, raw] of parsed.shadow) {
    (shadowTree.shadow as DtcgTree)[name] = {
      $type: "shadow",
      $value: splitShadowLayers(raw).map((layer) => parseShadowLayer(layer, allLight, shadowTriplet)),
    };
  }

  return {
    primitives: primitivesTree,
    semanticLight: {
      color: colorGroup(parsed.semanticLight, allLight, shadowTriplet),
      ...radiusTree,
      ...shadowTree,
    },
    semanticDark: {
      color: colorGroup(parsed.semanticDark, allDark, shadowTriplet),
    },
    themes: [
      {
        id: "light",
        name: "Light",
        selectedTokenSets: { primitives: "source", "semantic.light": "enabled" },
      },
      {
        id: "dark",
        name: "Dark",
        selectedTokenSets: { primitives: "source", "semantic.dark": "enabled" },
      },
    ],
  };
}
