import { expect, test, type Page } from '@playwright/test'
import { adminWithOrganization, closeDb, inviteDelegate, press, shot } from './helpers.ts'

test.afterAll(closeDb)

async function newContact(page: Page, name: string, phone = '') {
  await page.goto('/contacts')
  await press(page.getByRole('button', { name: 'Nuevo contacto' }))
  await page.getByLabel('Nombre').fill(name)
  if (phone) await page.getByLabel('Teléfono').fill(phone)
  await press(page.getByRole('button', { name: 'Crear contacto' }))
  await expect(page.getByRole('link', { name })).toBeVisible()
}

test('create a contact, see it listed with its delegate, edit it and read its timeline', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Contactos')
  await page.getByRole('link', { name: 'Contactos' }).first().click()
  await expect(page).toHaveURL(/\/contacts$/)
  await expect(page.getByText('Todavía no hay contactos')).toBeVisible()

  await newContact(page, 'Marta Gil', '+34 600 111 222')
  const row = page.getByRole('row', { name: /Marta Gil/ })
  await expect(row.getByText('+34600111222')).toBeVisible()
  await expect(row.getByText('Ana Admin')).toBeVisible() // its creator is the reference delegate
  await shot(page, 'contacts-list')

  await page.getByRole('link', { name: 'Marta Gil' }).click()
  await expect(page.getByRole('heading', { name: 'Marta Gil' })).toBeVisible()
  await page.getByLabel('Email').fill('marta@example.com')
  await press(page.getByRole('button', { name: 'Guardar' }).first())
  // Saving reloads the form: wait for it (the timeline shows it) before typing again.
  await expect(page.getByText('Contacto editado')).toBeVisible()
  // A malformed phone is refused with the normalized message.
  await page.getByLabel('Teléfono').fill('600111222')
  await press(page.getByRole('button', { name: 'Guardar' }).first())
  await expect(page.getByText('Revisa los datos del formulario.')).toBeVisible()
  await page.getByLabel('Teléfono').fill('+34 611 222 333')
  await press(page.getByRole('button', { name: 'Guardar' }).first())

  await expect(page.getByText('Contacto editado')).toHaveCount(2)
  await expect(page.getByText('Contacto creado')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Teléfono')).toHaveValue('+34611222333')
  await shot(page, 'contact-detail')
})

test('affiliation: register, fee warning, end and rejoin', async ({ page }) => {
  await adminWithOrganization(page, 'Afiliados')
  await newContact(page, 'Afiliado Uno')
  await page.getByRole('link', { name: 'Afiliado Uno' }).click()
  await expect(page.getByText('Sin dar de alta.')).toBeVisible()

  // The pending-fee notice is a fixed rule (a month long past), not something an AI infers.
  await page.getByLabel('Número de afiliado').fill('48213')
  await page.getByLabel('Cuota pagada hasta').fill('2020-01')
  await press(page.getByRole('button', { name: 'Dar de alta' }))
  await expect(page.getByText('Afiliación activa')).toBeVisible()
  await expect(page.getByText(/pendiente\.$/)).toBeVisible()

  await press(page.getByRole('button', { name: 'Dar de baja' }))
  await press(page.getByRole('alertdialog').getByRole('button', { name: 'Dar de baja' }))
  await expect(page.getByText('Buen momento para proponer que vuelva a afiliarse.')).toBeVisible()

  // Same form to rejoin, with the member number kept.
  await expect(page.getByLabel('Número de afiliado')).toHaveValue('48213')
  await press(page.getByRole('button', { name: 'Volver a afiliar' }))
  await expect(page.getByText('Afiliación activa')).toBeVisible()
  await expect(page.getByText('Afiliación dada de baja')).toBeVisible() // on the timeline
})

test('a delegate sees only their contacts; the admin reassigns and the visibility follows', async ({
  browser,
  page,
}) => {
  await adminWithOrganization(page, 'Delegados')
  const luis = await inviteDelegate(page, browser, 'Luis')

  await newContact(page, 'Del admin')
  await newContact(luis, 'De Luis')
  await expect(luis.getByRole('link', { name: 'Del admin' })).toHaveCount(0)
  await expect(
    luis.getByRole('row', { name: /De Luis/ }).getByRole('cell', { name: 'Luis', exact: true }),
  ).toBeVisible()

  // The admin's contact is invisible to Luis: its page looks like a missing one.
  await page.goto('/contacts')
  await page.getByRole('link', { name: 'Del admin' }).click()
  await page.waitForURL(/\/contacts\/[0-9a-f-]{36}$/)
  const adminContactUrl = page.url()
  await luis.goto(adminContactUrl)
  await expect(luis.getByText('Este contacto no existe o no tienes acceso a él.')).toBeVisible()

  // Luis can read who answers for his contact but cannot reassign it.
  await luis.goto('/contacts')
  await luis.getByRole('link', { name: 'De Luis' }).click()
  await expect(luis.getByLabel(/Delegado de referencia de/)).toHaveCount(0)

  // The admin hands it to herself: Luis loses it and the history keeps both.
  await page.goto('/contacts')
  await page.getByRole('link', { name: 'De Luis' }).click()
  await page.getByLabel('Delegado de referencia de De Luis').selectOption({ label: 'Ana Admin' })
  await press(page.getByRole('alertdialog').getByRole('button', { name: 'Reasignar' }))
  await expect(page.getByText('Historial de delegados')).toHaveCount(0) // no such heading: a list
  await expect(page.getByText(/Luis — .* \(actual\)|Luis — .* a /)).toBeVisible()
  await expect(page.getByText('Delegado de referencia cambiado')).toBeVisible()
  await luis.goto('/contacts')
  await expect(luis.getByRole('link', { name: 'De Luis' })).toHaveCount(0)
  await expect(luis.getByText('Todavía no hay contactos')).toBeVisible()
})
