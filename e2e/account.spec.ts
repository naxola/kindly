import { expect, test } from '@playwright/test'
import {
  adminWithOrganization,
  closeDb,
  emailUrl,
  expectAccessible,
  PASSWORD,
  press,
  uniqueEmail,
} from './helpers.ts'

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

test('changing the sign-in email is confirmed from the old address and then the new one', async ({
  page,
}) => {
  const oldEmail = await adminWithOrganization(page, 'Cambio')
  const newEmail = uniqueEmail('nuevo')
  await page.goto('/settings/account')
  await page.getByLabel('Email nuevo').fill(newEmail)
  await press(page.getByRole('button', { name: 'Cambiar email' }))
  await expect(page.getByText(`Te hemos enviado un correo a ${oldEmail}`)).toBeVisible()

  // Step 1: the link sent to the CURRENT address.
  await page.goto(await emailUrl('identity.change-email-confirmation-email', oldEmail))
  // Step 2: the verification sent to the NEW address.
  await page.goto(await emailUrl('identity.verification-email', newEmail))

  // The account now signs in with the new address, and the old one is gone.
  await page.context().clearCookies()
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(oldEmail)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Entrar' }))
  await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible()
  await page.getByLabel('Email').fill(newEmail)
  await press(page.getByRole('button', { name: 'Entrar' }))
  await expect(page).toHaveURL(/\/$/)
})
