import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, inviteDelegate, press, shot } from './helpers.ts'

test.afterAll(closeDb)

test('an administrator creates a procedure and publishes a new version; a delegate can only read', async ({
  browser,
  page,
}) => {
  await adminWithOrganization(page, 'Gestiones')
  await page.goto('/knowledge')
  await press(page.getByRole('link', { name: 'Trámites' }))
  await expect(page.getByRole('heading', { name: 'Trámites' })).toBeVisible()

  await press(page.getByRole('button', { name: 'Nuevo trámite' }))
  const panel = page.getByRole('dialog')
  await panel.getByLabel('Nombre').fill('Baja por IT')
  await panel.getByLabel(/Pasos/).fill('Recoger el parte\nRegistrarlo\nRecoger el parte')
  await panel.getByLabel(/Documentos requeridos/).fill('Parte de baja\nDNI')
  await press(panel.getByRole('button', { name: 'Crear trámite' }))
  const row = page.getByRole('row', { name: /Baja por IT/ })
  await expect(row).toBeVisible()
  await expect(row.getByRole('cell', { name: '1', exact: true })).toBeVisible()
  await press(row.getByRole('link', { name: 'Baja por IT' }))

  // Version 1: duplicates dropped, order kept.
  const v1 = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Versión 1' }) })
  await expect(v1.getByRole('listitem')).toHaveText([
    'Recoger el parte',
    'Registrarlo',
    'Parte de baja',
    'DNI',
  ])
  await expect(v1.getByText('Vigente')).toBeVisible()
  await shot(page, 'procedure')

  // Publishing: the form starts from the current version; the old one stays as it was.
  const steps = page.getByLabel(/Pasos/)
  await expect(steps).toHaveValue('Recoger el parte\nRegistrarlo')
  await steps.fill('Recoger el parte\nRegistrarlo\nAvisar al afiliado')
  await press(page.getByRole('button', { name: 'Publicar versión' }))
  const v2 = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Versión 2' }) })
  await expect(v2.getByText('Vigente')).toBeVisible()
  await expect(v2.getByText('Avisar al afiliado')).toBeVisible()
  await expect(v1.getByText('Sustituida')).toBeVisible()
  await expect(v1.getByText('Avisar al afiliado')).toHaveCount(0)

  // A delegate reads (the required documents) but is offered no way to write.
  const luis = await inviteDelegate(page, browser, 'Luis')
  await luis.goto('/knowledge/procedures')
  await expect(luis.getByRole('button', { name: 'Nuevo trámite' })).toHaveCount(0)
  await press(luis.getByRole('link', { name: 'Baja por IT' }))
  await expect(luis.getByText('Parte de baja').first()).toBeVisible()
  await expect(luis.getByRole('button', { name: 'Publicar versión' })).toHaveCount(0)
})
