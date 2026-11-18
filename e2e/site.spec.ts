import { expect, test } from '@playwright/test'
import { SITE_URL } from '../playwright.config.ts'
import { shot } from './helpers.ts'

const APP_URL = 'http://localhost:3100'

test('the bare domain goes to the Spanish landing, with links to the app', async ({ page }) => {
  await page.goto(SITE_URL)
  await expect(page).toHaveURL(`${SITE_URL}/es`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
    'href',
    `${APP_URL}/sign-in`,
  )
  await expect(page.getByRole('link', { name: 'Crear cuenta' }).first()).toHaveAttribute(
    'href',
    `${APP_URL}/sign-up`,
  )
  await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
    'href',
    `${SITE_URL}/en`,
  )
  await shot(page, 'site-home')

  // Same page in English.
  await page.getByRole('link', { name: 'English' }).click()
  await expect(page).toHaveURL(`${SITE_URL}/en`)
  await expect(page.getByRole('link', { name: 'Create account' }).first()).toBeVisible()
})

test('blog: list, post with structured data and social card, RSS', async ({ page, request }) => {
  await page.goto(`${SITE_URL}/es/blog`)
  await page.getByRole('link', { name: 'Cómo escribir en el blog' }).click()
  await expect(page).toHaveURL(`${SITE_URL}/es/blog/como-escribir-en-el-blog`)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Cómo escribir en el blog' }),
  ).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent())!,
  ) as Record<string, unknown>
  expect(jsonLd).toMatchObject({ '@type': 'BlogPosting', headline: 'Cómo escribir en el blog' })
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect((await request.get(ogImage!)).headers()['content-type']).toBe('image/png')
  await shot(page, 'site-post')

  const rss = await request.get(`${SITE_URL}/es/blog/rss.xml`)
  expect(rss.headers()['content-type']).toContain('application/rss+xml')
  expect(await rss.text()).toContain(`<link>${SITE_URL}/es/blog/como-escribir-en-el-blog</link>`)
})

test('sitemap lists the pages of both locales and the posts', async ({ request }) => {
  const sitemap = await (await request.get(`${SITE_URL}/sitemap.xml`)).text()
  expect(sitemap).toContain(`<loc>${SITE_URL}/es/pricing</loc>`)
  expect(sitemap).toContain(`<loc>${SITE_URL}/en/blog/how-to-write-on-the-blog</loc>`)
  expect(sitemap).toContain('hreflang="en"')
  // Unreviewed legal templates are neither listed nor indexed.
  expect(sitemap).not.toContain('/legal/')
})

test('legal pages: company data filled in, warning while not reviewed, not indexed', async ({
  page,
}) => {
  await page.goto(`${SITE_URL}/es/legal/privacy`)
  await expect(page.getByText('Plantilla pendiente de revisión legal')).toBeVisible()
  await expect(page.getByText('Hayat Iberia S.L.').first()).toBeVisible()
  await expect(page.getByText('B42637348').first()).toBeVisible()
  await expect(page.getByText('privacy@daedaluscognitio.com').first()).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  // What is not confirmed yet is visibly marked, never plausible-looking.
  await expect(page.getByText(/REVISAR: proveedor de alojamiento/)).toBeVisible()
  await shot(page, 'site-legal')
})

test('the five legal documents exist in both languages, linked from the footer', async ({
  page,
}) => {
  await page.goto(`${SITE_URL}/es`)
  const footer = page.getByRole('navigation', { name: 'Legal' })
  for (const name of ['Privacidad', 'Términos', 'Aviso legal', 'Eliminar mis datos', 'Cookies']) {
    await expect(footer.getByRole('link', { name })).toBeVisible()
  }
  // The data deletion page (the URL Meta requires) says how, and to whom, with no login.
  await page.goto(`${SITE_URL}/es/legal/data-deletion`)
  await expect(page.getByRole('heading', { level: 1, name: 'Eliminar mis datos' })).toBeVisible()
  await expect(page.getByText('72 horas')).toBeVisible()
  await expect(page.getByText('privacy@daedaluscognitio.com').first()).toBeVisible()
  // The legal notice carries the owner's identification, written in full.
  await page.goto(`${SITE_URL}/es/legal/legal-notice`)
  await expect(
    page.getByText('Calle Rambla Baja, 97, 1.º I, 03360 Callosa de Segura (Alicante)'),
  ).toBeVisible()
  await expect(page.getByText(/REVISAR: datos registrales/)).toBeVisible()
  await page.goto(`${SITE_URL}/en/legal/data-deletion`)
  await expect(page.getByRole('heading', { level: 1, name: 'Delete my data' })).toBeVisible()
  await page.goto(`${SITE_URL}/en/legal/terms`)
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible()
})

test("Meta's domain verification token is published as a meta tag", async ({ page }) => {
  await page.goto(`${SITE_URL}/es`)
  await expect(page.locator('meta[name="facebook-domain-verification"]')).toHaveAttribute(
    'content',
    'e2e-verification-token',
  )
})

test('pricing without plans says so, without invented prices', async ({ page }) => {
  await page.goto(`${SITE_URL}/es/pricing`)
  await expect(page.getByText('Estamos preparando los precios.')).toBeVisible()
})
