import { expect, test } from '@playwright/test'
import { adminWithOrganization, closeDb, inviteDelegate, press, shot } from './helpers.ts'

test.afterAll(closeDb)

test('connect a channel in one step, see it, and disconnect it with confirmation', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Canales')
  await page.goto('/settings/members')
  await press(page.getByRole('link', { name: 'Canales' }))
  await expect(page).toHaveURL(/\/settings\/channels$/)
  await expect(page.getByText('Todavía no has conectado ningún canal.')).toBeVisible()

  await press(page.getByRole('button', { name: 'Conectar fake', exact: true }))
  const mine = page.getByRole('list', { name: 'Conectados a tu nombre' })
  await expect(mine.getByText('Conectado', { exact: true })).toBeVisible()
  await expect(mine.getByText('Los mensajes se sincronizan con normalidad.')).toBeVisible()
  // One account per channel: the connect button is gone.
  await expect(page.getByText('Ya tienes una cuenta conectada en este canal.')).toBeVisible()
  await shot(page, 'channels')

  await press(mine.getByRole('button', { name: 'Desconectar' }))
  await press(page.getByRole('alertdialog').getByRole('button', { name: 'Desconectar' }))
  await expect(mine.getByText('Desconectado', { exact: true })).toBeVisible()
  await expect(mine.getByRole('button', { name: 'Desconectar' })).toHaveCount(0)
  // Disconnected, it can be connected again.
  await expect(page.getByRole('button', { name: 'Conectar fake', exact: true })).toBeVisible()
})

test('WhatsApp-style onboarding: only the available path, every point acknowledged, no disconnect from Kindly', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Asistente')
  await page.goto('/settings/channels')
  await press(page.getByRole('link', { name: 'Conectar fake-coexistence' }))

  // Step 1: three ways in, only coexistence is available, the others say why.
  await expect(page.getByRole('heading', { name: 'Conectar WhatsApp' })).toBeVisible()
  await expect(page.getByText('Crear una cuenta de WhatsApp Business nueva')).toBeVisible()
  await expect(page.getByText('Migrar desde otro proveedor (BSP)')).toBeVisible()
  await expect(page.getByText('No disponible todavía.')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Siguiente' })).toHaveCount(1)
  await press(page.getByRole('link', { name: 'Siguiente' }))

  // Step 2: the button waits for every point; the country cannot be checked and it says so.
  await expect(page.getByRole('heading', { name: 'Antes de conectar tu número' })).toBeVisible()
  await expect(page.getByText('Todavía no podemos comprobar automáticamente')).toBeVisible()
  const go = page.getByRole('button', { name: 'Continuar' })
  await expect(go).toBeDisabled()
  const boxes = page.getByRole('checkbox')
  await expect(boxes).toHaveCount(6)
  for (let i = 0; i < 5; i++) await boxes.nth(i).check()
  await expect(go).toBeDisabled()
  await boxes.nth(5).check()
  await expect(go).toBeEnabled()
  await shot(page, 'channels-onboarding')
  await press(go)

  // Connected, and the screen is honest about who can end it.
  await expect(page).toHaveURL(/\/settings\/channels$/)
  const mine = page.getByRole('list', { name: 'Conectados a tu nombre' })
  await expect(mine.getByText('Conectado', { exact: true })).toBeVisible()
  await expect(mine.getByText('Este canal se desconecta desde tu propio móvil')).toBeVisible()
  await expect(mine.getByRole('button', { name: 'Desconectar' })).toHaveCount(0)
})

test('each person sees their own channels; the administrator sees all and can disconnect a delegate', async ({
  browser,
  page,
}) => {
  await adminWithOrganization(page, 'Visibilidad')
  const luis = await inviteDelegate(page, browser, 'Luis')
  await luis.goto('/settings/channels')
  await expect(luis.getByText('Canales del resto de la organización')).toHaveCount(0)
  await press(luis.getByRole('button', { name: 'Conectar fake', exact: true }))
  await expect(
    luis.getByRole('list', { name: 'Conectados a tu nombre' }).getByText('Conectado', {
      exact: true,
    }),
  ).toBeVisible()

  await page.goto('/settings/channels')
  const others = page.getByRole('list', { name: 'Canales del resto de la organización' })
  await expect(others.getByText('Luis')).toBeVisible()
  await expect(page.getByText('Todavía no has conectado ningún canal.')).toBeVisible()
  await press(others.getByRole('button', { name: 'Desconectar' }))
  await press(page.getByRole('alertdialog').getByRole('button', { name: 'Desconectar' }))
  await expect(others.getByText('Desconectado', { exact: true })).toBeVisible()
})
