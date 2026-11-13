import { expect, test } from '@playwright/test'
import {
  adminWithOrganization,
  closeDb,
  deliverFakeMessage,
  fakeAccount,
  inviteDelegate,
  press,
  shot,
} from './helpers.ts'

test.afterAll(closeDb)

test('a message arrives, shows in the inbox, is opened, answered and moves out of pending', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Bandeja')
  const account = await fakeAccount(page)
  await page.goto('/inbox')
  await expect(page.getByText('No hay conversaciones aquí')).toBeVisible()

  await deliverFakeMessage(page, account, {
    from: 'Marta Gil',
    text: 'Necesito ayuda con mi cuota',
  })
  await page.reload()
  const row = page.getByRole('link', { name: /Marta Gil/ })
  await expect(row).toBeVisible()
  await expect(row.getByText('Sin identificar')).toBeVisible()
  await expect(row.getByText('Necesito ayuda con mi cuota')).toBeVisible()
  await expect(page.getByRole('button', { name: /Pendientes/ })).toContainText('1')
  await expect(page.getByRole('button', { name: /Sin leer/ })).toContainText('1')
  await shot(page, 'inbox')

  // Search narrows the list; the counters ignore it.
  await page.getByLabel('Buscar conversaciones').fill('cuota')
  await expect(row).toBeVisible()
  await page.getByLabel('Buscar conversaciones').fill('inexistente')
  await expect(page.getByText('No hay conversaciones aquí')).toBeVisible()
  await expect(page.getByRole('button', { name: /Pendientes/ })).toContainText('1')
  await page.getByLabel('Buscar conversaciones').fill('')
  await expect(row).toBeVisible()

  // Opening it shows the thread, marks it read and offers the composer (it is the own account).
  await press(row)
  await expect(page.getByRole('log').getByText('Necesito ayuda con mi cuota')).toBeVisible()
  await expect(page.getByLabel('Mensaje')).toBeVisible()
  await shot(page, 'conversation')
  await page.getByLabel('Mensaje').fill('Claro Marta, ¿qué ocurre?')
  await press(page.getByRole('button', { name: 'Enviar' }))
  await expect(page.getByRole('log').getByText('Claro Marta, ¿qué ocurre?')).toBeVisible()
  await expect(page.getByLabel('Mensaje')).toHaveValue('')

  // Answered: it is no longer pending, and the list shows who spoke last.
  await press(page.getByRole('link', { name: 'Bandeja' }).first())
  await expect(page.getByText('No hay conversaciones aquí')).toBeVisible()
  await press(page.getByRole('button', { name: /Todas/ }))
  await expect(page.getByText('Tú: Claro Marta, ¿qué ocurre?')).toBeVisible()
  await expect(page).toHaveURL(/view=all/)
})

test("an administrator reads a delegate's conversation but cannot answer from their number", async ({
  browser,
  page,
}) => {
  await adminWithOrganization(page, 'Identidad')
  const luis = await inviteDelegate(page, browser, 'Luis')
  const luisAccount = await fakeAccount(luis)
  await deliverFakeMessage(luis, luisAccount, { from: 'Marta', text: 'Hola Luis' })

  // The delegate sees and answers it.
  await luis.goto('/inbox')
  await press(luis.getByRole('link', { name: /Marta/ }))
  await expect(luis.getByLabel('Mensaje')).toBeVisible()

  // The admin sees it too (read only): no composer, and the reason is explained.
  await page.goto('/inbox')
  await press(page.getByRole('link', { name: /Marta/ }))
  await expect(page.getByRole('log').getByText('Hola Luis')).toBeVisible()
  await expect(page.getByLabel('Mensaje')).toHaveCount(0)
  await expect(page.getByText(/Solo lectura: esta conversación está en el número de/)).toBeVisible()
  await shot(page, 'conversation-readonly')
})

test('a delegate cannot open the conversation of someone else', async ({ browser, page }) => {
  await adminWithOrganization(page, 'Ajenas')
  const luis = await inviteDelegate(page, browser, 'Luis')
  const own = await fakeAccount(page)
  await deliverFakeMessage(page, own, { from: 'Del admin', text: 'Hola admin' })
  await page.goto('/inbox')
  await press(page.getByRole('link', { name: /Del admin/ }))
  await page.waitForURL(/\/inbox\/[0-9a-f-]{36}$/)
  const url = page.url()

  await luis.goto('/inbox?view=all')
  await expect(luis.getByText('No hay conversaciones aquí')).toBeVisible()
  await luis.goto(url)
  await expect(
    luis.getByText('Esta conversación no existe o no tienes acceso a ella.'),
  ).toBeVisible()
})
