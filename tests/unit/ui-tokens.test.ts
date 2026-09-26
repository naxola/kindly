import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards for the design system (docs/ui/TOKENS.md):
 *
 * 1. Every text/background pair components rely on meets WCAG AA, computed
 *    from the real values in src/styles/tokens.css — so a palette tweak that
 *    breaks contrast fails here, not in an accessibility audit months later.
 * 2. Components never hardcode visual values: no Tailwind default palette,
 *    no hex colours, no numeric z-index, no arbitrary pixel sizes. Those are
 *    what make a rebrand a file-by-file job.
 */

const root = path.resolve(import.meta.dirname, "../..");
const tokensCss = readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");

function resolveTokens(css: string): Map<string, string> {
  const raw = new Map<string, string>();
  // Only the :root blocks before the Tailwind bridge: the light theme.
  const lightTheme = css.slice(0, css.indexOf("@theme inline {"));
  for (const match of lightTheme.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    if (!raw.has(match[1])) {
      raw.set(match[1], match[2].trim());
    }
  }
  const resolved = new Map<string, string>();
  const resolve = (name: string, depth = 0): string => {
    const value = raw.get(name);
    if (value === undefined || depth > 10) {
      throw new Error(`Unresolvable token ${name}`);
    }
    const reference = value.match(/^var\((--[a-z0-9-]+)\)$/);
    return reference ? resolve(reference[1], depth + 1) : value;
  };
  for (const name of raw.keys()) {
    resolved.set(name, resolve(name));
  }
  return resolved;
}

const tokens = resolveTokens(tokensCss);

function hex(name: string): string {
  const value = tokens.get(`--${name}`);
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`--${name} is not a 6-digit hex colour (got ${value})`);
  }
  return value;
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(hex(foreground)), luminance(hex(background))].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const TEXT = 4.5; // WCAG 1.4.3, normal text
const NON_TEXT = 3; // WCAG 1.4.11, control boundaries and meaningful graphics

const PAIRS: Array<[foreground: string, background: string, minimum: number]> = [
  ["foreground", "background", TEXT],
  ["foreground-light", "background", TEXT],
  ["foreground-lighter", "background", TEXT],
  ["foreground-lighter", "background-muted", TEXT],
  ["foreground-lighter", "state-selected", TEXT],
  ["foreground-light", "state-hover", TEXT],
  ["primary", "background", TEXT],
  ["primary-foreground", "primary", TEXT],
  ["primary-foreground", "primary-hover", TEXT],
  ["primary-soft-foreground", "primary-soft", TEXT],
  ["destructive-foreground", "destructive", TEXT],
  ["destructive-foreground", "destructive-hover", TEXT],
  ["destructive-soft-foreground", "destructive-soft", TEXT],
  ["warning-soft-foreground", "warning-soft", TEXT],
  ["success-soft-foreground", "success-soft", TEXT],
  ["info-soft-foreground", "info-soft", TEXT],
  ["foreground-light", "background-muted", TEXT],
  ["bubble-inbound-foreground", "bubble-inbound", TEXT],
  ["bubble-outbound-foreground", "bubble-outbound", TEXT],
  ["foreground-lighter", "bubble-inbound", TEXT],
  ["foreground-lighter", "bubble-outbound", TEXT],
  ["evidence-sufficient", "background", TEXT],
  ["evidence-partial", "background", TEXT],
  ["evidence-insufficient", "background", TEXT],
  ["ink-faint", "paper", TEXT],
  ["ink-soft", "paper", TEXT],
  ["border-control", "control", NON_TEXT],
  ["border-control", "background-muted", NON_TEXT],
  ["ring", "background", NON_TEXT],
  ["read-receipt", "bubble-outbound", NON_TEXT],
  ["warning", "background", NON_TEXT],
  ["destructive", "background", NON_TEXT],
];

describe("design tokens: contrast", () => {
  it.each(PAIRS)("%s on %s reaches %s:1", (foreground, background, minimum) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
  });

  it("keeps foreground-muted for disabled/decorative text only (it is below AA by design)", () => {
    expect(contrast("foreground-muted", "background")).toBeLessThan(TEXT);
  });
});

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? listFiles(full) : full.endsWith(".tsx") ? [full] : [];
  });
}

// Directories that must be fully tokenised. Legacy pages under src/app are
// migrated in UI phase 4 and added here then (docs/ui/ROADMAP.md).
const TOKENISED_DIRECTORIES = ["src/components", "src/app/(app)/ui-kit"];

const FORBIDDEN: Array<[label: string, pattern: RegExp]> = [
  [
    "Tailwind default palette",
    /\b(?:bg|text|border|ring|outline|fill|stroke|from|to|via|decoration|divide|placeholder|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/,
  ],
  ["hex colour", /#[0-9a-fA-F]{3,8}\b(?![-\w])/],
  ["numeric z-index", /\bz-\d+\b/],
  ["arbitrary pixel value", /-\[\d+(?:\.\d+)?px\]/],
  ["numeric duration", /\bduration-\d+\b/],
];

describe("design tokens: no hardcoded visual values in components", () => {
  const files = TOKENISED_DIRECTORIES.flatMap((directory) => listFiles(path.join(root, directory)));

  it("finds the component files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [path.relative(root, file)]))("%s uses only tokens", (relative) => {
    const source = readFileSync(path.join(root, relative), "utf8");
    const violations = FORBIDDEN.flatMap(([label, pattern]) =>
      source
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && pattern.test(line))
        .map(({ line, index }) => `${label} at line ${index + 1}: ${line.trim()}`),
    );
    expect(violations).toEqual([]);
  });
});
