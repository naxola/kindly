/**
 * Operator tool: regenerates tokens/dtcg/*.json from src/styles/tokens.css
 * (docs/ui/TOKENS.md §3). CSS stays the source of truth — this is a derived
 * export for importing into Figma (Tokens Studio's multi-set workflow, or
 * the Variables REST API), checked into git so it's importable without
 * running anything.
 *
 * Usage: npm run tokens:export
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildDtcg, parseTokensCss } from "./lib/tokens-dtcg";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "tokens/dtcg");

function main() {
  const css = readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
  const dtcg = buildDtcg(parseTokensCss(css));

  mkdirSync(outDir, { recursive: true });
  const write = (file: string, data: unknown) =>
    writeFileSync(path.join(outDir, file), `${JSON.stringify(data, null, 2)}\n`);

  write("primitives.json", dtcg.primitives);
  write("semantic.light.json", dtcg.semanticLight);
  write("semantic.dark.json", dtcg.semanticDark);
  write("$themes.json", dtcg.themes);

  console.log(`Wrote tokens/dtcg/{primitives,semantic.light,semantic.dark,$themes}.json`);
}

main();
