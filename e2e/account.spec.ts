import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, expectAccessible, PASSWORD, press } from './helpers.ts'

test.afterAll(closeDb)

test('a person changes their name and language, then their password, and signs in with it', async ({
  page,
}) => {
  const email = await adminWithOrganization(page, 'Cuenta')
  await page.goto('/settings/account')
  await expect(page.getByRole('heading', { name: 'Cuenta', exact: true })).toBeVisible()
  await expectAccessible(page, 'account')

  // Name and language.
  await page.getByLabel('Nombre').fill('Ana Renombrada')
  await page.getByLabel('Idioma').selectOption('en')
  await press(page.getByRole('button', { name: 'Guardar' }))
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveValue('Ana Renombrada')
  await page.getByLabel('Language').selectOption('es')
  await press(page.getByRole('button', { name: 'Save' }))
  await expect(page.getByRole('heading', { name: 'Cuenta', exact: true })).toBeVisible()

  // Password: a wrong current one is refused, the right one changes it.
  const next = 'otra frase igual de larga'
  await page.getByLabel('Contraseña actual').fill('no es esta contraseña')
  await page.getByLabel('Contraseña nueva').fill(next)
  await page.getByLabel('Repite la contraseña').fill(next)
  await press(page.getByRole('button', { name: 'Cambiar contraseña' }))
  await expect(page.getByRole('alert').filter({ hasText: 'no es correcta' })).toBeVisible()

  await page.getByLabel('Contraseña actual').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Cambiar contraseña' }))
  await expect(page.getByText('Contraseña cambiada')).toBeVisible()

  // The old password no longer works; the new one does.
  await page.context().clearCookies()
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Entrar' }))
  await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible()
  await page.getByLabel('Contraseña').fill(next)
  await press(page.getByRole('button', { name: 'Entrar' }))
  await expect(page).toHaveURL(/\/$/)
})
