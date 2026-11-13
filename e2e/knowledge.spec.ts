import { expect, test, type Page } from '@playwright/test'
import {
  adminWithOrganization,
  closeDb,
  ingestPendingKnowledge,
  inviteDelegate,
  press,
  shot,
} from './helpers.ts'

test.afterAll(closeDb)

const LAW = [
  'Artículo 1',
  'La baja por incapacidad temporal se tramita en una semana.',
  '',
  'Artículo 2',
  'El permiso retribuido por matrimonio dura quince días.',
].join('\n')

async function upload(page: Page, title: string, text: string, from = '2024-01-01') {
  await press(page.getByRole('button', { name: 'Subir documento' }))
  const panel = page.getByRole('dialog')
  await panel.getByLabel('Título').fill(title)
  await panel.getByLabel('Origen').selectOption('TEXT')
  await panel.getByLabel('Archivo', { exact: true }).setInputFiles({
    name: 'norma.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  })
  await panel.getByLabel('Versión', { exact: true }).fill('2024')
  await panel.getByLabel('En vigor desde').fill(from)
  await panel.getByLabel(/Nota de fuente/).fill('BOE núm. 5, de 2024-01-10')
  await press(panel.getByRole('button', { name: 'Subir', exact: true }))
}

test('an administrator uploads a text, it is processed in the background and can be searched with its citation', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Saber')
  await page.goto('/knowledge')
  // (GLOBAL documents of the shared test database are readable too: only ours are looked for.)

  await upload(page, 'Convenio colectivo', LAW)
  // Accepted: the version is pending until the worker (here, the same use case) processes it.
  const row = page.getByRole('row', { name: /Convenio colectivo/ })
  await expect(row.getByText('En cola')).toBeVisible()
  expect(await ingestPendingKnowledge(page)).toBe(1)
  // The list refreshes by itself while something is in flight.
  await expect(row.getByText('Vigente')).toBeVisible({ timeout: 15_000 })
  await expect(row.getByText('En cola')).toHaveCount(0)
  await shot(page, 'knowledge')

  // Search: the citation carries source, version, validity, location and the text.
  await page.getByLabel('Buscar en el conocimiento').fill('baja incapacidad temporal')
  await press(page.getByRole('button', { name: 'Buscar', exact: true }))
  const results = page.getByRole('list', { name: 'Resultados de la búsqueda' })
  const card = results.getByRole('article').first()
  await expect(card.getByRole('link', { name: 'Convenio colectivo' })).toBeVisible()
  await expect(card).toContainText('Versión 2024')
  await expect(card).toContainText('BOE núm. 5, de 2024-01-10')
  await expect(card).toContainText('Artículo 1')
  await expect(card).toContainText('La baja por incapacidad temporal')
  await expect(card.getByText('Vigente')).toBeVisible()
  await shot(page, 'knowledge-search')

  // A date before anything came into force finds nothing: only what was applicable then.
  await page.getByLabel('Fecha de consulta').fill('2000-01-01')
  await press(page.getByRole('button', { name: 'Buscar', exact: true }))
  await expect(page.getByText('Sin resultados')).toBeVisible()

  // The document: versions and their fragments.
  await page.goto('/knowledge')
  await press(page.getByRole('link', { name: 'Convenio colectivo' }))
  await expect(page.getByRole('heading', { name: 'Convenio colectivo' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Versión 2024' })).toBeVisible()
  await press(page.getByRole('button', { name: 'Ver fragmentos' }))
  await expect(
    page.getByText('El permiso retribuido por matrimonio dura quince días.'),
  ).toBeVisible()

  // A new version supersedes the previous one only when it is ready.
  await press(page.getByRole('button', { name: 'Nueva versión' }))
  const panel = page.getByRole('dialog')
  await panel.getByLabel('Origen').selectOption('TEXT')
  await panel.getByLabel('Archivo', { exact: true }).setInputFiles({
    name: 'v2.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Artículo 1\nLa baja se tramita en tres días.'),
  })
  await panel.getByLabel('Versión', { exact: true }).fill('2026')
  await panel.getByLabel('En vigor desde').fill('2026-01-01')
  await press(panel.getByRole('button', { name: 'Subir', exact: true }))
  const v2026 = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Versión 2026' }) })
  await expect(v2026.getByText('En cola')).toBeVisible()
  await expect(
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Versión 2024' }) })
      .getByText('Vigente'),
  ).toBeVisible()
  await ingestPendingKnowledge(page)
  await expect(v2026.getByText('Vigente')).toBeVisible({ timeout: 15_000 })
  await expect(
    page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Versión 2024' }) })
      .getByText('Sustituida'),
  ).toBeVisible()
})

test('what is wrong with a submission is said, and a delegate reads and searches but cannot upload', async ({
  browser,
  page,
}) => {
  await adminWithOrganization(page, 'Permisos')
  await page.goto('/knowledge')
  await press(page.getByRole('button', { name: 'Subir documento' }))
  const panel = page.getByRole('dialog')
  await panel.getByLabel('Título').fill('Falso PDF')
  await panel.getByLabel('Archivo', { exact: true }).setInputFiles({
    name: 'falso.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('esto no es un pdf'),
  })
  await panel.getByLabel('Versión', { exact: true }).fill('1')
  await panel.getByLabel('En vigor desde').fill('2024-01-01')
  await press(panel.getByRole('button', { name: 'Subir', exact: true }))
  await expect(panel.getByText('El archivo no es un PDF válido.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()

  await upload(page, 'Interno', LAW)
  // (The request is answered before the worker has anything to do: wait for it to be pending.)
  await expect(page.getByRole('row', { name: /Interno/ }).getByText('En cola')).toBeVisible()
  await ingestPendingKnowledge(page)

  const luis = await inviteDelegate(page, browser, 'Luis')
  await luis.goto('/knowledge')
  await expect(luis.getByRole('table').getByRole('link', { name: 'Interno' })).toBeVisible()
  await expect(luis.getByRole('button', { name: 'Subir documento' })).toHaveCount(0)
  await luis.getByLabel('Buscar en el conocimiento').fill('permiso matrimonio')
  await press(luis.getByRole('button', { name: 'Buscar', exact: true }))
  await expect(luis.getByRole('article').first()).toContainText(
    'El permiso retribuido por matrimonio',
  )
  await press(luis.getByRole('table').getByRole('link', { name: 'Interno' }))
  await expect(luis.getByRole('button', { name: 'Nueva versión' })).toHaveCount(0)
})
