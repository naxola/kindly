import { expect, test } from '@playwright/test'
import {
  adminWithOrganization,
  closeDb,
  emailUrl,
  expectAccessible,
  press,
  uniqueEmail,
} from './helpers.ts'

test.afterAll(closeDb)

test('an admin renames the organization, resends an invitation and archives it', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Ajustes')
  await page.goto('/settings/organization')
  await expect(page.getByRole('heading', { name: 'Organización', exact: true })).toBeVisible()
  await expectAccessible(page, 'organization settings')

  await page.getByLabel('Nombre').fill('Ajustes Renombrada')
  await press(page.getByRole('button', { name: 'Guardar' }))
  await expect(page.getByText('Organización guardada')).toBeVisible()
  await expect(page.getByRole('button', { name: /Organización: Ajustes Renombrada/ })).toBeVisible()

  // The only ADMIN cannot leave.
  await press(page.getByRole('button', { name: 'Salir', exact: true }))
  await press(page.getByRole('dialog').getByRole('button', { name: 'Salir' }))
  await expect(
    page.getByRole('alert').filter({ hasText: 'al menos un Administrador' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  // Resend: a second email with a different link.
  const guest = uniqueEmail('guest')
  await page.goto('/settings/members')
  await press(page.getByRole('button', { name: 'Invitar' }))
  await page.getByLabel('Email').fill(guest)
  await press(page.getByRole('button', { name: 'Enviar invitación' }))
  await expect(page.getByRole('cell', { name: guest })).toBeVisible()
  const first = await emailUrl('identity.invitation-email', guest)
  await press(page.getByRole('button', { name: 'Reenviar' }))
  await expect(page.getByText(`Invitación reenviada a ${guest}`)).toBeVisible()
  await expect.poll(() => emailUrl('identity.invitation-email', guest)).not.toBe(first)

  // Archive: the button stays disabled until the exact name is typed.
  await page.goto('/settings/organization')
  const archive = page.getByRole('button', { name: 'Archivar', exact: true })
  await expect(archive).toBeDisabled()
  await page.getByLabel(/Escribe/).fill('Ajustes Renombrada')
  await expect(archive).toBeEnabled()
  await press(archive)
  // Nothing left to enter: back to the onboarding to create another one.
  await expect(page).toHaveURL(/\/onboarding/)
})
