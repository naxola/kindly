import { expect, test, type Page } from '@playwright/test'
import { SITE_URL } from '../playwright.config.ts'

/** Browser console messages about a Content-Security-Policy violation (also in Report-Only). */
function watchCsp(page: Page): string[] {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text())
  })
  return violations
}

const COMMON = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

test('web sends security headers and a CSP with a nonce, with no violations', async ({ page }) => {
  const violations = watchCsp(page)
  const response = await page.goto('/sign-in')
  const headers = response!.headers()
  for (const [name, value] of Object.entries(COMMON)) expect(headers[name]).toBe(value)
  expect(headers['permissions-policy']).toContain('camera=()')
  const csp = headers['content-security-policy-report-only'] ?? headers['content-security-policy']
  expect(csp).toMatch(/script-src [^;]*'nonce-[^']+' 'strict-dynamic'/)
  expect(csp).toContain(`frame-ancestors 'none'`)
  await page.getByRole('button').first().waitFor()
  expect(violations).toEqual([])
})

test('the nonce changes on every request', async ({ request }) => {
  const nonce = async () => {
    const response = await request.get('/sign-in')
    const csp = response.headers()['content-security-policy-report-only'] ?? ''
    return /'nonce-([^']+)'/.exec(csp)?.[1]
  }
  const first = await nonce()
  expect(first).toBeTruthy()
  expect(await nonce()).not.toBe(first)
})

test('site sends security headers and has no CSP violations', async ({ page }) => {
  const violations = watchCsp(page)
  const response = await page.goto(`${SITE_URL}/es`)
  const headers = response!.headers()
  for (const [name, value] of Object.entries(COMMON)) expect(headers[name]).toBe(value)
  const csp = headers['content-security-policy-report-only'] ?? headers['content-security-policy']
  expect(csp).toContain(`frame-ancestors 'none'`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  expect(violations).toEqual([])
})
