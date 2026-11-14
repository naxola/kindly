import { expect, test } from '@playwright/test'

const DSN_ORIGIN = 'http://localhost:3199'

test('a browser error is reported to the DSN, without the URL fragment, cookies or breadcrumbs', async ({
  page,
}) => {
  await page.route(`${DSN_ORIGIN}/**`, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      body: '{}',
    }),
  )
  await page.goto('/sign-in#secret-fragment-token')
  await page.getByLabel('Email').fill('typed-by-the-person@example.com')
  // The SDK loads lazily after hydration: wait until it is in place before the error happens.
  await page.waitForLoadState('networkidle')
  const sent = page.waitForRequest((r) => r.url().startsWith(`${DSN_ORIGIN}/api/1/envelope`))
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('e2e browser boom')
    }, 0)
  })
  const body = (await sent).postData() ?? ''
  expect(body).toContain('e2e browser boom')
  expect(body).not.toContain('secret-fragment-token')
  expect(body).not.toContain('typed-by-the-person')
  expect(body).not.toContain('"breadcrumbs"')
  expect(body).not.toContain('"cookies"')
})

test('the CSP lets the page reach the DSN host', async ({ request }) => {
  const csp = (await request.get('/sign-in')).headers()['content-security-policy-report-only']
  expect(csp).toMatch(new RegExp(`connect-src [^;]*${DSN_ORIGIN}`))
})
