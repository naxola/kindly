import { test } from '@playwright/test'
import { SITE_URL } from '../playwright.config.ts'
import { adminWithOrganization, closeDb, expectAccessible, press } from './helpers.ts'

test.afterAll(closeDb)

test('public screens of the web have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/sign-in', '/sign-up', '/forgot-password', '/esta-ruta-no-existe']) {
    await page.goto(path)
    await expectAccessible(page, path)
  }
})

test('the screens of the application have no serious accessibility violations', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Accesible')
  await expectAccessible(page, 'home')
  await page.goto('/settings/members')
  await page.getByRole('cell', { name: 'Ana Admin' }).first().waitFor()
  await expectAccessible(page, 'members')
  await press(page.getByRole('button', { name: 'Invitar' }))
  await page.getByLabel('Email').waitFor()
  await expectAccessible(page, 'members › invite panel')
  await page.keyboard.press('Escape')
  await page.goto('/settings/account')
  await page.getByRole('heading', { name: 'Perfil' }).waitFor()
  await expectAccessible(page, 'account')
  await page.goto('/settings/billing')
  await page.getByText('Plan').first().waitFor()
  await expectAccessible(page, 'billing')
})

test('the public site has no serious accessibility violations', async ({ page }) => {
  for (const path of ['/es', '/en', '/es/pricing', '/es/blog', '/es/legal/privacy', '/es/nada']) {
    await page.goto(`${SITE_URL}${path}`)
    await expectAccessible(page, `site ${path}`)
  }
})
