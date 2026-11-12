import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * UI-8 (`docs/ui/ROADMAP.md` "Fase 8"): fails the test with a readable
 * report when axe finds a "serious" or "critical" WCAG 2.x AA violation on
 * the current page — the phase's acceptance criterion ("sin violaciones
 * axe serias/críticas"). "minor"/"moderate" findings are out of scope for
 * this automated gate; they're covered by the manual checklist instead
 * (`docs/ui/ACCESSIBILITY.md` §7), since axe's own docs warn those levels
 * carry more false positives requiring human judgement.
 */
export async function expectNoSeriousAccessibilityViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");

  const report = serious
    .map((violation) => `- [${violation.impact}] ${violation.id}: ${violation.help} (${violation.nodes.length} nodo(s)) — ${violation.helpUrl}`)
    .join("\n");

  expect(serious, `Violaciones de accesibilidad en ${context}:\n${report}`).toEqual([]);
}
