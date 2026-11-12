import { expect, test } from '@playwright/test'
import {
  adminWithOrganization,
  closedBillingPeriod,
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
  await adminPage.getByLabel('Nombre').fill('Gael')
  await adminPage.getByLabel('Apellidos').fill('Guest')
  await adminPage.getByLabel('Teléfono').fill('+34 600 111 222')
  await adminPage.getByLabel('Cargo').selectOption({ label: 'Delegado' })
  await press(adminPage.getByRole('button', { name: 'Enviar invitación' }))
  await expect(adminPage.getByRole('cell', { name: /Gael Guest/ })).toBeVisible()
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
  await guestPage.getByLabel('Nombre').fill('Cuenta de Gael')
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

  // The admin sees the guest with the name, position and phone chosen in the invitation
  // (the profile of this organization, not the name of the access account).
  await adminPage.reload()
  await expect(adminPage.getByText(guestEmail)).toBeVisible()
  const guestRow = adminPage.getByRole('row', { name: /Gael Guest/ })
  await expect(guestRow.getByText('Delegado')).toBeVisible()
  await expect(guestRow.getByText('+34600111222')).toBeVisible()
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
  await adminPage.getByLabel('Nombre').fill('Kim')
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

test('an admin sees the plan and usage of the organization', async ({ page }) => {
  await adminWithOrganization(page, 'Planes')
  await page.goto('/settings/members')
  await page.getByRole('link', { name: 'Plan y consumo' }).click()
  await expect(page).toHaveURL(/\/settings\/billing$/)
  await expect(page.getByText('Gratuito')).toBeVisible()
  await expect(page.getByText('Plan base')).toBeVisible()
  await expect(page.getByText('Este plan no mide consumo')).toBeVisible()
  await shot(page, 'billing')

  // After the hourly close, closed periods are listed.
  await closedBillingPeriod(page)
  await page.reload()
  await expect(page.getByText('Activo')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Periodos cerrados' })).toBeVisible()
  await expect(page.getByText('Sin excedente')).toBeVisible()
  await shot(page, 'billing-periods')
})

test('positions: an admin manages them, assigns one, and a member edits their own data', async ({
  browser,
}) => {
  const adminPage = await (await browser.newContext()).newPage()
  await adminWithOrganization(adminPage, 'Cargos')

  // The catalog starts with the default position and grows by the admin's hand.
  await adminPage.goto('/settings/positions')
  await expect(adminPage.getByRole('cell', { name: 'Delegado' })).toBeVisible()
  await press(adminPage.getByRole('button', { name: 'Añadir cargo' }))
  await adminPage.getByLabel('Nombre').fill('Presidente')
  await press(adminPage.getByRole('button', { name: 'Guardar' }))
  await expect(adminPage.getByRole('cell', { name: 'Presidente' })).toBeVisible()

  // Names are unique, ignoring case: the error shows in the panel.
  await press(adminPage.getByRole('button', { name: 'Añadir cargo' }))
  await adminPage.getByLabel('Nombre').fill('presidente')
  await press(adminPage.getByRole('button', { name: 'Guardar' }))
  await expect(adminPage.getByText('Ya existe un cargo con ese nombre')).toBeVisible()
  await press(adminPage.getByRole('button', { name: 'Cancelar' }))

  // Invite someone with that position; the guest becomes a plain MEMBER.
  const guestEmail = uniqueEmail('cargo')
  await adminPage.goto('/settings/members')
  await press(adminPage.getByRole('button', { name: 'Invitar' }))
  await adminPage.getByLabel('Email').fill(guestEmail)
  await adminPage.getByLabel('Nombre').fill('Eva')
  await adminPage.getByLabel('Cargo').selectOption({ label: 'Presidente' })
  await press(adminPage.getByRole('button', { name: 'Enviar invitación' }))
  await expect(adminPage.getByRole('cell', { name: guestEmail })).toBeVisible()

  const guestPage = await (await browser.newContext()).newPage()
  await guestPage.goto(await emailUrl('identity.invitation-email', guestEmail))
  await guestPage.getByLabel('Nombre').fill('Cuenta de Eva')
  await guestPage.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
  await guestPage.getByLabel('Repite la contraseña').fill(PASSWORD)
  await press(guestPage.getByRole('button', { name: 'Crear cuenta y unirme' }))
  await expect(guestPage.getByText('Estás en Cargos.')).toBeVisible()

  // A MEMBER reads the catalog but has no actions on it.
  await guestPage.goto('/settings/positions')
  await expect(guestPage.getByRole('cell', { name: 'Presidente' })).toBeVisible()
  await expect(guestPage.getByRole('button', { name: 'Añadir cargo' })).toHaveCount(0)

  // ... and edits only their own data: no position, no notes.
  await guestPage.goto('/settings/members')
  const evaRow = guestPage.getByRole('row', { name: /Eva/ })
  await expect(evaRow.getByText('Presidente')).toBeVisible()
  await expect(guestPage.getByRole('button', { name: /Editar ficha: / })).toHaveCount(1)
  await press(evaRow.getByRole('button', { name: /Editar ficha/ }))
  await expect(guestPage.getByLabel('Cargo')).toHaveCount(0)
  await expect(guestPage.getByLabel('Notas internas')).toHaveCount(0)
  await guestPage.getByLabel('Teléfono').fill('611 222 333')
  await press(guestPage.getByRole('button', { name: 'Guardar' }))
  await expect(guestPage.getByText('Revisa los datos del formulario.')).toBeVisible()
  await guestPage.getByLabel('Teléfono').fill('+34 611 222 333')
  await press(guestPage.getByRole('button', { name: 'Guardar' }))
  await expect(evaRow.getByText('+34611222333')).toBeVisible()
  await shot(guestPage, 'member-profile')

  // The admin archives the position: it stays on whoever has it, no longer on offer.
  await adminPage.goto('/settings/positions')
  await press(
    adminPage.getByRole('row', { name: /Presidente/ }).getByRole('button', { name: 'Archivar' }),
  )
  await press(adminPage.getByRole('alertdialog').getByRole('button', { name: 'Archivar' }))
  await expect(
    adminPage.getByRole('row', { name: /Presidente/ }).getByText('Archivado'),
  ).toBeVisible()
  await adminPage.goto('/settings/members')
  await expect(
    adminPage.getByRole('row', { name: /Eva/ }).getByText('Presidente (archivado)'),
  ).toBeVisible()
})
