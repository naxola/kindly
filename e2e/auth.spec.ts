import { expect, test } from '@playwright/test'
import { closeDb, emailUrl, PASSWORD, press, shot, signUp, uniqueEmail } from './helpers.ts'

test.afterAll(closeDb)

test('sign-up, email verification, sign-out and sign-in', async ({ page }) => {
  const email = uniqueEmail('ana')
  await signUp(page, { name: 'Ana', email })
  // Signed in, but not in the product yet: onboarding (ADR 0003).
  await expect(page).toHaveURL(/\/onboarding/)
  await shot(page, 'onboarding')

  await page.context().clearCookies()
  await page.goto('/sign-in')

  // A wrong password is rejected with a translated message.
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill('esta no es la buena')
  await press(page.getByRole('button', { name: 'Entrar' }))
  await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible()

  await page.getByLabel('Contraseña').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Entrar' }))
  await expect(page).toHaveURL(/\/onboarding/)
})

test('protected pages send anonymous visitors to sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('password recovery through the emailed link', async ({ page }) => {
  const email = uniqueEmail('luis')
  await signUp(page, { name: 'Luis', email })
  await page.context().clearCookies()

  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill(email)
  await press(page.getByRole('button', { name: 'Enviar enlace' }))
  await expect(page.getByText('Si existe una cuenta')).toBeVisible()

  await page.goto(await emailUrl('identity.password-reset-email', email))
  const fresh = 'otra frase larga y nueva'
  await page.getByLabel('Contraseña nueva').fill(fresh)
  await page.getByLabel('Repite la contraseña').fill(fresh)
  await press(page.getByRole('button', { name: 'Guardar contraseña' }))
  await expect(page).toHaveURL(/\/sign-in/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Contraseña').fill(fresh)
  await press(page.getByRole('button', { name: 'Entrar' }))
  await expect(page).toHaveURL(/\/onboarding/)
})
