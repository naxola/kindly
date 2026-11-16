import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, inviteDelegate, press } from './helpers.ts'

test.afterAll(closeDb)

/** A fictitious alta as the automation sends it (unique DNI shape per call). */
const alta = (apellidos: string) => ({
  tipoSolicitud: 'alta',
  validoParaProcesar: true,
  errores: [],
  afiliado: {
    nombre: 'MARÍA',
    apellidos,
    dni: `${String(Date.now()).slice(-8)}W`,
    telefono: '600111222',
    email: 'maria.alta@example.test',
    afiliacion: { cuotaMensual: '11.5 €' },
  },
})

test('an administrator creates a key, an alta arrives, and they confirm its delegate', async ({
  page,
  browser,
}) => {
  await adminWithOrganization(page, 'Altas')
  await inviteDelegate(page, browser, 'Luis')

  await page.goto('/settings/integrations')
  // Wait for the page to be interactive before submitting (under load the click could come first).
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Nombre de la clave').fill('n8n')
  await page.getByRole('button', { name: 'Crear clave' }).click()
  const tokenBox = page.locator('code', { hasText: /^kly_/ })
  await expect(tokenBox).toBeVisible()
  const token = (await tokenBox.textContent())!.trim()
  await press(page.getByRole('button', { name: 'Ya la he guardado' }))
  await expect(page.getByRole('cell', { name: 'n8n', exact: true })).toBeVisible()

  // The automation sends the alta with the key; nothing else identifies the organization.
  const res = await page.request.post('/api/integrations/affiliate-requests', {
    headers: { authorization: `Bearer ${token}` },
    data: [alta('PRUEBA ALTA')],
  })
  expect(res.status()).toBe(202)
  const body = (await res.json()) as { results: { status: string }[] }
  expect(body.results[0]?.status).toBe('RECEIVED')

  // Anywhere in the app, the administrator is told; the contacts list links to the altas.
  await page.goto('/contacts')
  await expect(page.getByText('Tienes 1 alta pendiente de revisar')).toBeVisible()
  await press(page.getByRole('link', { name: 'Altas (1)' }))
  await expect(page).toHaveURL(/\/contacts\/requests$/)
  const row = page.getByRole('row', { name: /María Prueba Alta/ })
  await expect(row.getByText('Luis')).toBeVisible() // the only delegate is the proposal

  await press(page.getByRole('button', { name: 'Revisar el alta de María Prueba Alta' }))
  const panel = page.getByRole('dialog')
  await expect(panel.getByText('11,50 €')).toBeVisible()
  await expect(panel.getByLabel('Delegado de referencia')).toHaveValue(/.+/)
  await panel.getByLabel('Enviar email de bienvenida').check()
  await press(panel.getByRole('button', { name: 'Confirmar' }))
  await expect(page.getByText('Alta de María Prueba Alta confirmada.')).toBeVisible()
  await expect(page.getByText('No hay altas pendientes')).toBeVisible()

  await page.goto('/contacts')
  await expect(page.getByRole('row', { name: /María Prueba Alta/ }).getByText('Luis')).toBeVisible()
})

test('a delegate sees neither the altas nor the integrations', async ({ page, browser }) => {
  await adminWithOrganization(page, 'Privadas')
  const luis = await inviteDelegate(page, browser, 'Luis')
  await luis.goto('/contacts')
  await expect(luis.getByRole('link', { name: /^Altas/ })).toHaveCount(0)
  await luis.goto('/contacts/requests')
  await expect(luis.getByText('No tienes permiso para esta acción.').first()).toBeVisible()
})
