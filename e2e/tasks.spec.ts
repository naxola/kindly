import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, inviteDelegate, press } from './helpers.ts'

test.afterAll(closeDb)

test('create a task for a contact, complete it from the list, edit it and read its timeline', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Tareas')
  await page.goto('/contacts')
  await press(page.getByRole('button', { name: 'Nuevo contacto' }))
  await page.getByLabel('Nombre').fill('Marta Gil')
  await press(page.getByRole('button', { name: 'Crear contacto' }))
  await expect(page.getByRole('link', { name: 'Marta Gil' })).toBeVisible()

  await page.getByRole('link', { name: 'Tareas' }).first().click()
  await expect(page).toHaveURL(/\/tasks$/)
  await expect(page.getByText('Todavía no hay tareas')).toBeVisible()

  await press(page.getByRole('button', { name: 'Nueva tarea' }))
  await page.getByLabel('Título').fill('Llamar a Marta')
  await page.getByLabel('Contacto').selectOption({ label: 'Marta Gil' })
  await page.getByLabel('Asignar a').selectOption({ label: 'Ana Admin' })
  await page.getByLabel('Fecha límite').fill('2026-12-01')
  await press(page.getByRole('button', { name: 'Crear tarea' }))
  const row = page.getByRole('row', { name: /Llamar a Marta/ })
  await expect(row).toBeVisible()
  await expect(row.getByRole('link', { name: 'Marta Gil' })).toBeVisible()
  await expect(row.getByText('Ana Admin')).toBeVisible()
  await expect(row.getByText('1 dic 2026')).toBeVisible()

  // One-click completion flips the strike-through and the filters follow.
  await press(row.getByRole('button', { name: 'Marcar como completada' }))
  await expect(page.getByRole('link', { name: 'Llamar a Marta' })).toHaveClass(/line-through/)
  await press(page.getByRole('button', { name: 'Pendientes' }))
  await expect(page.getByText('Todavía no hay tareas')).toBeVisible()
  await press(page.getByRole('button', { name: 'Completadas' }))
  await expect(page.getByRole('link', { name: 'Llamar a Marta' })).toBeVisible()

  // Detail: edit and reopen; the timeline keeps the story.
  // The expanded navigation rail hovers over the content after clicking it: press the link.
  await press(page.getByRole('link', { name: 'Llamar a Marta' }))
  await page.getByLabel('Título').fill('Llamar a Marta Gil')
  await page.getByLabel('Completada').uncheck()
  await press(page.getByRole('button', { name: 'Guardar' }))
  await expect(page.getByRole('heading', { name: 'Llamar a Marta Gil' })).toBeVisible()
  await expect(page.getByText('Tarea creada')).toBeVisible()
  await expect(page.getByText('Tarea completada')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Completada')).not.toBeChecked()
})

test('a delegate sees the general tasks and those of their contacts, not the others', async ({
  browser,
  page,
}) => {
  await adminWithOrganization(page, 'Visibles')
  const luis = await inviteDelegate(page, browser, 'Luis')

  await page.goto('/contacts')
  await press(page.getByRole('button', { name: 'Nuevo contacto' }))
  await page.getByLabel('Nombre').fill('Del admin')
  await press(page.getByRole('button', { name: 'Crear contacto' }))
  await expect(page.getByRole('link', { name: 'Del admin' })).toBeVisible()

  await page.goto('/tasks')
  await press(page.getByRole('button', { name: 'Nueva tarea' }))
  await page.getByLabel('Título').fill('Tarea general')
  await press(page.getByRole('button', { name: 'Crear tarea' }))
  await expect(page.getByRole('link', { name: 'Tarea general' })).toBeVisible()
  await press(page.getByRole('button', { name: 'Nueva tarea' }))
  await page.getByLabel('Título').fill('Tarea de contacto ajeno')
  await page.getByLabel('Contacto').selectOption({ label: 'Del admin' })
  await press(page.getByRole('button', { name: 'Crear tarea' }))
  await expect(page.getByRole('link', { name: 'Tarea de contacto ajeno' })).toBeVisible()
  await page.getByRole('link', { name: 'Tarea de contacto ajeno' }).click()
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/)
  const hiddenUrl = page.url()

  await luis.goto('/tasks')
  await expect(luis.getByRole('link', { name: 'Tarea general' })).toBeVisible()
  await expect(luis.getByRole('link', { name: 'Tarea de contacto ajeno' })).toHaveCount(0)
  // Its page looks like a missing one, and its contact is not offered when creating tasks.
  await luis.goto(hiddenUrl)
  await expect(luis.getByText('Esta tarea no existe o no tienes acceso a ella.')).toBeVisible()
  await luis.goto('/tasks')
  await press(luis.getByRole('button', { name: 'Nueva tarea' }))
  await expect(luis.getByLabel('Contacto').locator('option')).toHaveText(['Sin contacto'])
})
