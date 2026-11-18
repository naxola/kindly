import { expect, test } from '@playwright/test'
import { SITE_URL } from '../playwright.config.ts'
import { adminWithOrganization, closeDb } from './helpers.ts'

test.afterAll(closeDb)

test('an unknown address shows the not-found page in both apps', async ({ page }) => {
  const web = await page.goto('/esta-ruta-no-existe')
  expect(web?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ir al inicio' })).toBeVisible()

  const site = await page.goto(`${SITE_URL}/es/esta-ruta-no-existe`)
  expect(site?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible()
  await page.goto(`${SITE_URL}/en/nope`)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('a failed members request shows the error with its reference and recovers on retry', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Estados')
  let fail = true
  await page.route('**/api/v1/members', async (route) => {
    if (!fail) return route.continue()
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INTERNAL', message: 'boom', correlationId: 'corr-e2e-123' },
      }),
    })
  })
  await page.goto('/settings/members')
  const alert = page.getByRole('alert').filter({ hasText: 'No se han podido cargar' })
  await expect(alert).toContainText('No se han podido cargar los datos')
  await expect(alert).toContainText('corr-e2e-123')
  // No empty table that could be mistaken for "no members".
  await expect(page.getByRole('table')).toHaveCount(0)

  fail = false
  await alert.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByRole('table').first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Ana Admin' }).first()).toBeVisible()
})
