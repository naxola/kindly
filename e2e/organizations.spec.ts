import { expect, test } from '@playwright/test'
import {
  adminWithOrganization,
  closeDb,
  PASSWORD,
  createOrganization,
  emailUrl,
  press,
  signUp,
  shot,
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

  // The guest opens the emailed link (token in the fragment): only name and password.
  const invitationUrl = await emailUrl('identity.invitation-email', guestEmail)
  const guestPage = await (await browser.newContext()).newPage()
  await guestPage.goto(invitationUrl)
  await expect(guestPage.getByRole('heading', { name: 'Únete a Acme' })).toBeVisible()
  // The token does not stay in the address bar.
  expect(new URL(guestPage.url()).hash).toBe('')
  await expect(guestPage.getByLabel('Email')).toHaveValue(guestEmail)
  await expect(guestPage.getByRole('link', { name: 'Iniciar sesión' })).toHaveCount(0)
  await shot(guestPage, 'invitation')
  await guestPage.getByLabel('Nombre').fill('Gael Guest')
  await guestPage.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await guestPage.getByLabel('Repite la contraseña').fill(PASSWORD)
  await press(guestPage.getByRole('button', { name: 'Crear cuenta y unirme' }))
  await expect(guestPage.getByText('Estás en Acme.')).toBeVisible()

  // Opening the same link again: it was already used, so it only offers to sign in.
  const later = await (await browser.newContext()).newPage()
  await later.goto(invitationUrl)
  await expect(later.getByText('Este enlace ya se ha usado')).toBeVisible()
  await expect(later.getByRole('button', { name: 'Crear cuenta y unirme' })).toHaveCount(0)
  await shot(later, 'invitation-used')
  await press(later.getByRole('link', { name: 'Iniciar sesión' }))
  await expect(later.getByLabel('Email')).toHaveValue(guestEmail)

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

test('someone who already has an account signs in from the invitation and joins', async ({
  browser,
}) => {
  // An existing account (signed up elsewhere, no organization yet).
  const guestEmail = uniqueEmail('known')
  const known = await (await browser.newContext()).newPage()
  await signUp(known, { name: 'Kim Known', email: guestEmail })
  await known.context().clearCookies()

  const adminPage = await (await browser.newContext()).newPage()
  await adminWithOrganization(adminPage, 'Gamma')
  await adminPage.goto('/settings/members')
  await press(adminPage.getByRole('button', { name: 'Invitar' }))
  await adminPage.getByLabel('Email').fill(guestEmail)
  await press(adminPage.getByRole('button', { name: 'Enviar invitación' }))
  await expect(adminPage.getByRole('cell', { name: guestEmail })).toBeVisible()

  await known.goto(await emailUrl('identity.invitation-email', guestEmail))
  await expect(known.getByText(`Ya hay una cuenta con ${guestEmail}`)).toBeVisible()
  await press(known.getByRole('link', { name: 'Iniciar sesión y unirme' }))
  await expect(known.getByLabel('Email')).toHaveValue(guestEmail)
  await known.getByLabel('Contraseña').fill(PASSWORD)
  await press(known.getByRole('button', { name: 'Entrar' }))
  await press(known.getByRole('button', { name: 'Aceptar la invitación' }))
  await expect(known.getByText('Estás en Gamma.')).toBeVisible()
})
