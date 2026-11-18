import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

/**
 * Fails with a readable report when axe finds a serious or critical WCAG 2.x AA violation on the
 * current page. Minor and moderate findings are not gated here: axe itself warns they carry more
 * false positives that need human judgement.
 */
export async function expectNoSeriousViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  const report = serious
    .map(
      (v) =>
        `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes
          .slice(0, 2)
          .map((n) => {
            const d = n.any[0]?.data as
              { fgColor?: string; bgColor?: string; contrastRatio?: number } | undefined
            return `${n.target.join(' ')}${d?.fgColor ? ` (${d.fgColor} on ${d.bgColor}: ${d.contrastRatio})` : ''}`
          })
          .join(' | ')}`,
    )
    .join('\n')
  expect(serious, `Accessibility violations in ${where}:\n${report}`).toEqual([])
}
