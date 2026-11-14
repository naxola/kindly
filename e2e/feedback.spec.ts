import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, PASSWORD, press, uniqueEmail } from './helpers.ts'

test.afterAll(closeDb)

test('an action that works says so with a confirmation', async ({ page }) => {
  await adminWithOrganization(page, 'Avisos')
  const guest = uniqueEmail('guest')
  await page.goto('/settings/members')
  await press(page.getByRole('button', { name: 'Invitar' }))
  await page.getByLabel('Email').fill(guest)
  await press(page.getByRole('button', { name: 'Enviar invitación' }))
  await expect(page.getByText(`Invitación enviada a ${guest}`)).toBeVisible()

  await press(page.getByRole('button', { name: 'Revocar' }))
  await expect(page.getByText('Invitación revocada')).toBeVisible()
})

test('an expired session goes to sign-in and comes back to the same screen', async ({ page }) => {
  const email = await adminWithOrganization(page, 'Caducada')
  await page.goto('/settings/members')
  await expect(page.getByRole('cell', { name: 'Ana Admin' })).toBeVisible()

  // The session ends (cookie gone) while the page is open; the next request fails with 401.
  await page.context().clearCookies()
  await press(page.getByRole('button', { name: 'Invitar' }))
  await page.getByLabel('Email').fill(uniqueEmail('late'))
  await press(page.getByRole('button', { name: 'Enviar invitación' }))
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fmembers/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Entrar' }))
  await expect(page).toHaveURL(/\/settings\/members$/)
  await expect(page.getByRole('cell', { name: 'Ana Admin' })).toBeVisible()
})
