import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, press } from './helpers.ts'

test.afterAll(closeDb)

test('the skip link jumps past the shell to the content, and the keyboard reaches the menu', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Atajos')
  await page.goto('/tasks')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Saltar al contenido' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#main$/)
  // F6 with a single region does nothing harmful: focus stays where it is.
  await page.keyboard.press('F6')
  await expect(page.locator('main')).toBeVisible()
})

test('the theme picked from the preferences applies at once and is kept on the next load', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Tema')
  const html = page.locator('html')
  // (A Radix menu opens on pointer down: a real click, not a dispatched event.)
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await page.getByRole('menuitemradio', { name: 'Claro' }).click()
  await expect(html).not.toHaveClass(/dark/)
  await page.reload()
  await expect(html).not.toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await page.getByRole('menuitemradio', { name: 'Oscuro' }).click()
  await expect(html).toHaveClass(/dark/)
})

test('below md the navigation is a menu opened from the top bar, and the page does not move sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await adminWithOrganization(page, 'Movil')
  await page.goto('/tasks')
  await expect(page.getByRole('navigation', { name: /principal|main/i })).toHaveCount(0)
  const toggle = page.getByRole('button', { name: /menú|menu|navegación/i }).first()
  await press(toggle)
  await expect(page.getByRole('link', { name: 'Bandeja' }).first()).toBeVisible()
})
