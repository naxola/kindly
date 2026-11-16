import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, expectAccessible, PASSWORD, press } from './helpers.ts'

test.afterAll(closeDb)

test('a person downloads their data, asks to delete the account, sees the countdown and cancels', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Borrable')
  await page.goto('/settings/account')
  await page.getByRole('heading', { name: 'Borrar la cuenta' }).waitFor()

  // Export: the link answers with a JSON download.
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Descargar (JSON)' }).click()
  expect((await download).suggestedFilename()).toBe('personal-data.json')

  // The only member of an organization: it will be archived, and it says so.
  await expect(
    page.getByText(/Se archivarán las organizaciones donde eres el único miembro/),
  ).toBeVisible()
  await expectAccessible(page, 'account › deletion form')

  // Wrong password: refused, nothing scheduled.
  await page.getByLabel('Tu contraseña').fill('esta no es la contraseña')
  await press(page.getByRole('button', { name: 'Solicitar el borrado' }))
  await expect(page.getByText('La contraseña no es correcta.')).toBeVisible()

  // Right password: scheduled, with the countdown, and the person keeps their session.
  await page.getByLabel('Tu contraseña').fill(PASSWORD)
  await press(page.getByRole('button', { name: 'Solicitar el borrado' }))
  await expect(page.getByText('Borrado programado')).toBeVisible()
  await expect(page.getByText(/Tu cuenta se eliminará el .* \(en 14 días\)/)).toBeVisible()
  await expectAccessible(page, 'account › deletion pending')
  await page.reload()
  await expect(page.getByText('Borrado programado')).toBeVisible()

  // Cancel: the form is back.
  await press(page.getByRole('button', { name: 'Cancelar el borrado' }))
  await expect(page.getByRole('button', { name: 'Solicitar el borrado' })).toBeVisible()
})
