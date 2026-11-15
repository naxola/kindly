import { expect, test, type Page } from '@playwright/test'
import { totp } from '../packages/adapters/test/totp.ts'
import { adminWithOrganization, closeDb, PASSWORD, press } from './helpers.ts'

test.afterAll(closeDb)

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Entrar' }))
}

test('turning on the second factor, signing in with a code and with a recovery code', async ({
  page,
}) => {
  const email = await adminWithOrganization(page, 'Dos pasos')
  await page.goto('/settings/account')

  // Set up: password, then the QR / key and a first code.
  await press(page.getByRole('button', { name: 'Activar', exact: true }))
  await page.getByLabel('Confirma tu contraseña para: Activar').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Activar', exact: true }))
  await expect(
    page.getByRole('img', { name: 'Código QR para la aplicación de autenticación' }),
  ).toBeVisible()
  const secret = (await page.locator('code.select-all').innerText()).trim()
  await page.getByLabel('Código', { exact: true }).fill(totp(secret))
  await press(page.getByRole('button', { name: 'Activar', exact: true }))

  // Recovery codes are shown once.
  await expect(page.getByText('Guárdalos ahora en un lugar seguro')).toBeVisible()
  const codes = await page
    .getByRole('list', { name: 'Códigos de recuperación' })
    .getByRole('listitem')
    .allInnerTexts()
  expect(codes).toHaveLength(10)
  await press(page.getByRole('button', { name: 'Los he guardado' }))
  await expect(page.getByText('Activada', { exact: true })).toBeVisible()

  // Signing in now asks for the code: a wrong one is refused, the right one gets in.
  await page.context().clearCookies()
  await signIn(page, email)
  await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible()
  await page.getByLabel('Código', { exact: true }).fill('000000')
  await press(page.getByRole('button', { name: 'Verificar' }))
  await expect(page.getByText('El código no es correcto.')).toBeVisible()
  await page.getByLabel('Código', { exact: true }).fill(totp(secret))
  await press(page.getByRole('button', { name: 'Verificar' }))
  await expect(page).toHaveURL(/\/$/)

  // A recovery code also gets in, once.
  await page.context().clearCookies()
  await signIn(page, email)
  await press(page.getByRole('button', { name: 'Usar un código de recuperación' }))
  await page.getByLabel('Código de recuperación').fill(codes[0]!.trim())
  await press(page.getByRole('button', { name: 'Verificar' }))
  await expect(page).toHaveURL(/\/$/)

  await page.context().clearCookies()
  await signIn(page, email)
  await press(page.getByRole('button', { name: 'Usar un código de recuperación' }))
  await page.getByLabel('Código de recuperación').fill(codes[0]!.trim())
  await press(page.getByRole('button', { name: 'Verificar' }))
  await expect(page.getByText('El código de recuperación no es válido.')).toBeVisible()
})

test('the open sessions are listed and another device can be signed out from here', async ({
  page,
  browser,
}) => {
  const email = await adminWithOrganization(page, 'Sesiones')
  const other = await (await browser.newContext()).newPage()
  await signIn(other, email)
  await expect(other).toHaveURL(/\/$/)

  await page.goto('/settings/account')
  await expect(page.getByText('Esta sesión')).toBeVisible()
  const sessions = page
    .getByRole('list')
    .filter({ hasText: 'Última actividad' })
    .getByRole('listitem')
  await expect(sessions).toHaveCount(2)
  await press(
    sessions.filter({ hasNotText: 'Esta sesión' }).getByRole('button', { name: 'Cerrar sesión' }),
  )
  await press(page.getByRole('alertdialog').getByRole('button', { name: 'Cerrar sesión' }))
  await expect(page.getByText('Sesión cerrada')).toBeVisible()
  await expect(sessions).toHaveCount(1)

  // The other device is out: its next request goes to sign-in.
  await other.goto('/settings/members')
  await expect(other).toHaveURL(/\/sign-in/)
})
