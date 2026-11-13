import { expect, test, type Page } from '@playwright/test'
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

interface Preview {
  id: string
  contactId: string
}
const firstConversation = async (page: Page) =>
  (
    (await (await page.request.get('/api/v1/conversations?view=all')).json()) as {
      items: Preview[]
    }
  ).items[0]!
const myMemberId = async (page: Page) =>
  ((await (await page.request.get('/api/v1/organization')).json()) as { member: { id: string } })
    .member.id

test('the panel shows chat and a read-only ficha; sending is optimistic and typing is signalled', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Espacio')
  const account = await fakeAccount(page)
  await deliverFakeMessage(page, account, {
    from: 'Marta Gil',
    text: 'Necesito ayuda con mi cuota',
  })
  const { contactId } = await firstConversation(page)
  // What the ficha should show: an affiliation with an overdue fee and an open task.
  await page.request.post(`/api/v1/contacts/${contactId}/affiliation`, {
    data: { memberNumber: 'A-17', startedAt: '2026-01-10', feePaidUntil: '2026-02' },
  })
  await page.request.post('/api/v1/tasks', {
    data: { title: 'Pedir el justificante', contactId },
  })

  await page.goto('/inbox')
  await press(page.getByRole('link', { name: /Marta Gil/ }))
  await expect(page).toHaveURL(/\/inbox\?conversation=[0-9a-f-]{36}$/)
  // The list stays next to the panel, with the open row marked.
  await expect(page.getByRole('list').getByRole('link', { name: /Marta Gil/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(page.getByRole('log').getByText('Necesito ayuda con mi cuota')).toBeVisible()

  const ficha = page.getByRole('complementary', { name: 'Ficha del afiliado' })
  await expect(ficha.getByText('Nº A-17')).toBeVisible()
  await expect(ficha.getByText(/Cuota de .* pendiente/)).toBeVisible()
  await expect(ficha.getByText('Pedir el justificante')).toBeVisible()
  await expect(ficha.getByText('Ana Admin')).toBeVisible() // reference delegate
  await expect(ficha.getByText(/Este contacto lo creó Kindly/)).toBeVisible()
  await expect(ficha.getByText('No hay otras conversaciones')).toBeVisible()
  await expect(ficha.getByRole('link', { name: 'Abrir la ficha completa' })).toBeVisible()
  // Read only: nothing to edit in it, and no cases (they are not part of Kindly yet).
  await expect(ficha.getByRole('textbox')).toHaveCount(0)
  // The one action it has: confirm who the contact is (the notice and the list badge go away).
  await press(ficha.getByRole('button', { name: 'Marcar como identificado' }))
  await expect(ficha.getByText(/Este contacto lo creó Kindly/)).toHaveCount(0)
  await expect(page.getByRole('list').getByText('Sin identificar')).toHaveCount(0)
  await expect(page.getByText(/Casos/)).toHaveCount(0)
  await shot(page, 'workspace')

  // "Typing…" is signalled once while writing (throttled), never on every keystroke.
  const typing: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/typing')) typing.push(r.url())
  })
  const composer = page.getByLabel('Mensaje')
  await composer.fill('Hola')
  await composer.fill('Hola Marta')
  await expect.poll(() => typing.length).toBe(1)

  // Optimistic: the bubble is there at once (with a clock) while the server is still answering.
  await page.route(/\/api\/v1\/conversations\/[^/]+\/messages$/, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return route.fallback()
  })
  await press(page.getByRole('button', { name: 'Enviar' }))
  const bubble = page.getByRole('log').getByText('Hola Marta')
  await expect(bubble).toBeVisible()
  await expect(composer).toHaveValue('')
  await expect(page.getByRole('log').getByRole('img', { name: 'Enviando' })).toBeVisible()
  await expect(page.getByRole('log').getByRole('img', { name: 'Enviado' })).toBeVisible()
  await expect(page.getByRole('log').getByText('Hola Marta')).toHaveCount(1)
  await page.unroute(/\/api\/v1\/conversations\/[^/]+\/messages$/)

  // A failed request leaves the bubble with the reason and a retry; retrying delivers it.
  await page.route(/\/api\/v1\/conversations\/[^/]+\/messages$/, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }),
        })
      : route.fallback(),
  )
  await composer.fill('Segundo intento')
  await press(page.getByRole('button', { name: 'Enviar' }))
  await expect(page.getByRole('alert').filter({ hasText: 'No enviado' })).toBeVisible()
  await page.unroute(/\/api\/v1\/conversations\/[^/]+\/messages$/)
  await press(page.getByRole('button', { name: 'Reintentar' }))
  await expect(page.getByRole('alert').filter({ hasText: 'No enviado' })).toHaveCount(0)
  await expect(page.getByRole('log').getByText('Segundo intento')).toHaveCount(1)
  await expect(page.getByRole('log').getByRole('img', { name: 'Enviado' })).toHaveCount(2)

  // The draft of an unsent message survives closing the panel.
  await composer.fill('Borrador sin enviar')
  await composer.press('Escape')
  await expect(page).not.toHaveURL(/conversation=/)
  // (Answered, it is no longer pending: look for it among all of them.)
  await press(page.getByRole('button', { name: /Todas/ }))
  await press(page.getByRole('link', { name: /Marta Gil/ }))
  await expect(page.getByLabel('Mensaje')).toHaveValue('Borrador sin enviar')
  // Back closes it, Forward reopens it.
  await page.goBack()
  await expect(page.getByLabel('Mensaje')).toHaveCount(0)
})

test('the ficha can be folded and the preference is remembered', async ({ page }) => {
  await adminWithOrganization(page, 'Plegable')
  const account = await fakeAccount(page)
  await deliverFakeMessage(page, account, { from: 'Marta Gil', text: 'Hola' })
  const { id } = await firstConversation(page)
  await page.goto(`/inbox?conversation=${id}`)
  const ficha = page.getByRole('complementary', { name: 'Ficha del afiliado' })
  await expect(ficha).toBeVisible()
  const chatWidth = async () => (await page.getByRole('log').boundingBox())!.width

  const before = await chatWidth()
  await press(page.getByRole('button', { name: 'Ocultar la ficha' }))
  await expect(ficha).toBeHidden()
  await expect(page.getByRole('button', { name: 'Mostrar la ficha' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  // The panel narrows with it: the chat keeps its width.
  expect(Math.abs((await chatWidth()) - before)).toBeLessThan(40)

  await page.reload()
  await expect(page.getByLabel('Mensaje')).toBeVisible()
  await expect(ficha).toBeHidden() // remembered, and already right on the first paint
  await press(page.getByRole('button', { name: 'Mostrar la ficha' }))
  await expect(ficha).toBeVisible()
})

test('below xl the panel takes the screen and the ficha is a tab; old links still work', async ({
  page,
}) => {
  await adminWithOrganization(page, 'Estrecha')
  const account = await fakeAccount(page)
  await deliverFakeMessage(page, account, { from: 'Marta Gil', text: 'Hola desde el móvil' })
  const { id } = await firstConversation(page)
  await page.setViewportSize({ width: 800, height: 900 })

  // `/inbox/<id>` (a link from before) opens the conversation in the inbox.
  await page.goto(`/inbox/${id}`)
  await expect(page).toHaveURL(`/inbox?conversation=${id}`)
  const ficha = page.getByRole('complementary', { name: 'Ficha del afiliado' })
  await expect(page.getByRole('log').getByText('Hola desde el móvil')).toBeVisible()
  await expect(page.getByRole('link', { name: /Marta Gil/ }).and(page.locator('li a'))).toBeHidden()
  await expect(ficha).toBeHidden()
  await press(page.getByRole('tab', { name: 'Ficha' }))
  await expect(page.getByRole('tab', { name: 'Ficha' })).toHaveAttribute('aria-selected', 'true')
  await expect(ficha).toBeVisible()
  await expect(page.getByLabel('Mensaje')).toBeHidden()
  await shot(page, 'workspace-narrow')
  await press(page.getByRole('tab', { name: 'Chat' }))
  await expect(page.getByLabel('Mensaje')).toBeVisible()
  await press(page.getByRole('button', { name: 'Cerrar conversación' }))
  await expect(page).toHaveURL('/inbox')
  await expect(page.getByRole('link', { name: /Marta Gil/ })).toBeVisible()
})

test('when the contact is reassigned, the conversation says who attends it now; others read only', async ({
  browser,
  page,
}) => {
  await adminWithOrganization(page, 'Atiende')
  const luis = await inviteDelegate(page, browser, 'Luis')
  const luisAccount = await fakeAccount(luis)
  await deliverFakeMessage(luis, luisAccount, { from: 'Marta', text: 'Hola Luis' })
  const { id, contactId } = await firstConversation(luis)

  // At first Luis attends Marta from his own number: no notice, he can answer.
  await luis.goto(`/inbox?conversation=${id}`)
  await expect(luis.getByLabel('Mensaje')).toBeVisible()
  await expect(luis.getByText(/Ahora lo atiende/)).toHaveCount(0)

  // The administrator takes the contact. The conversation stays on Luis's number.
  const reassigned = await page.request.put(`/api/v1/contacts/${contactId}/delegate`, {
    data: { delegateId: await myMemberId(page) },
  })
  expect(reassigned.status()).toBe(200)

  // Luis still answers from his own number, and is told to redirect the contact.
  await luis.reload()
  await expect(luis.getByText('Ahora lo atiende Ana Admin. Redirígele los mensajes')).toBeVisible()
  await expect(luis.getByLabel('Mensaje')).toBeVisible()

  // The administrator attends the contact but cannot answer from Luis's number: read only.
  await page.goto(`/inbox?conversation=${id}`)
  await expect(
    page.getByText('Ahora lo atiendes tú, pero esta conversación está en el número de Luis'),
  ).toBeVisible()
  await expect(
    page.getByText(/Solo lectura: esta conversación está en el número de Luis/),
  ).toBeVisible()
  await expect(page.getByLabel('Mensaje')).toHaveCount(0)
  await shot(page, 'workspace-readonly')
})
