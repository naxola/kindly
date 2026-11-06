import { expect, test } from '@playwright/test'
import {
  adminWithOrganization,
  closeDb,
  createOrganization,
  emailUrl,
  press,
  shot,
  signUp,
  uniqueEmail,
} from './helpers.ts'

test.afterAll(closeDb)

test('an admin creates an organization, invites someone, and manages members', async ({
  browser,
}) => {
  const adminPage = await (await browser.newContext()).newPage()
  await adminWithOrganization(adminPage, 'Acme')
  await expect(adminPage.getByText('Estás en Acme.')).toBeVisible()
  await shot(adminPage, 'home')

  // Invite a guest from the members settings.
  const guestEmail = uniqueEmail('guest')
  await adminPage.goto('/settings/members')
  await press(adminPage.getByRole('button', { name: 'Invitar' }))
  await adminPage.getByLabel('Email').fill(guestEmail)
  await press(adminPage.getByRole('button', { name: 'Enviar invitación' }))
  await expect(adminPage.getByRole('cell', { name: guestEmail })).toBeVisible()
  await shot(adminPage, 'members')

  // The guest opens the emailed link (token in the fragment), signs up and accepts.
  const guestPage = await (await browser.newContext()).newPage()
  await guestPage.goto(await emailUrl('identity.invitation-email', guestEmail))
  await expect(guestPage.getByRole('heading', { name: 'Únete a Acme' })).toBeVisible()
  // The token does not stay in the address bar.
  expect(new URL(guestPage.url()).hash).toBe('')
  await shot(guestPage, 'invitation')
  await press(guestPage.getByRole('link', { name: 'Crear cuenta' }))
  await expect(guestPage).toHaveURL(/\/sign-up\?next=%2Finvite/)
  await signUp(guestPage, { name: 'Gael Guest', email: guestEmail })
  await press(guestPage.getByRole('button', { name: 'Aceptar la invitación' }))
  await expect(guestPage.getByText('Estás en Acme.')).toBeVisible()

  // A MEMBER sees the members but cannot invite.
  await guestPage.goto('/settings/members')
  await expect(guestPage.getByRole('heading', { name: 'Miembros' })).toBeVisible()
  await expect(guestPage.getByRole('button', { name: 'Invitar' })).toHaveCount(0)

  // The admin sees the guest, promotes them and then disables them.
  await adminPage.reload()
  await expect(adminPage.getByText(guestEmail)).toBeVisible()
  await adminPage.getByLabel('Rol de Gael Guest').selectOption('ADMIN')
  await expect(adminPage.getByLabel('Rol de Gael Guest')).toHaveValue('ADMIN')
  await press(
    adminPage.getByRole('row', { name: /Gael Guest/ }).getByRole('button', { name: 'Desactivar' }),
  )
  await press(adminPage.getByRole('alertdialog').getByRole('button', { name: 'Desactivar' }))
  await expect(
    adminPage.getByRole('row', { name: /Gael Guest/ }).getByText('Desactivado'),
  ).toBeVisible()

  // The disabled guest is sent back to onboarding: no active organization left.
  await guestPage.goto('/')
  await expect(guestPage).toHaveURL(/\/onboarding/)
})

test('switching between organizations', async ({ page }) => {
  await adminWithOrganization(page, 'Alfa')
  await page.getByRole('button', { name: 'Organización' }).click()
  await page.getByRole('menuitem', { name: 'Crear otra organización' }).click()
  await createOrganization(page, 'Beta')
  await expect(page.getByText('Estás en Beta.')).toBeVisible()

  await page.getByRole('button', { name: 'Organización' }).click()
  await page.getByRole('menuitem', { name: 'Alfa' }).click()
  await expect(page.getByText('Estás en Alfa.')).toBeVisible()
})
