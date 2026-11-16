import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, expectAccessible, press, uniqueEmail } from './helpers.ts'

test.afterAll(closeDb)

test('an admin sees the activity of the organization and filters it', async ({ page }) => {
  await adminWithOrganization(page, 'Registro')
  await page.goto('/settings/members')
  await press(page.getByRole('button', { name: 'Invitar' }))
  await page.getByLabel('Email').fill(uniqueEmail('guest'))
  // Kindly: an invitation carries the person's first name (member profile).
  await page.getByLabel('Nombre').fill('Invitada')
  await press(page.getByRole('button', { name: 'Enviar invitación' }))
  await expect(page.getByText(/Invitación enviada a/)).toBeVisible()

  await page.goto('/settings/activity')
  await expect(page.getByRole('heading', { name: 'Actividad', exact: true })).toBeVisible()
  // Newest first, with a readable name and who did it.
  const rows = page.getByRole('row')
  await expect(rows.nth(1)).toContainText('Invitación enviada')
  await expect(rows.nth(1)).toContainText('Ana Admin')
  await expect(rows.nth(2)).toContainText('Organización creada')
  await expectAccessible(page, 'activity')

  await page.getByLabel('Mostrar').selectOption('organization')
  await expect(page.getByRole('cell', { name: 'Organización creada' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Invitación enviada' })).toHaveCount(0)
  await page.getByLabel('Mostrar').selectOption('billing')
  await expect(page.getByText('No hay actividad con ese filtro.')).toBeVisible()
})
