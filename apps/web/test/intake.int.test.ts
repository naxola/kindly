import { newId } from '@saas/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api } from '../src/server/api/app.ts'
import { closeFixtures, openFixtures, ORIGIN, person, type Fixtures } from './api-helpers.ts'

let fx: Fixtures
beforeAll(async () => {
  fx = await openFixtures()
})
afterAll(() => closeFixtures(fx))

const URL = '/api/integrations/affiliate-requests'

const post = (body: string, headers: Record<string, string> = {}) =>
  api.request(`${ORIGIN}${URL}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-ip': '2001:db8::77', ...headers },
    body,
  })

/** Fictitious alta with a unique DNI shape. */
const alta = () => ({
  tipoSolicitud: 'alta',
  validoParaProcesar: true,
  errores: [],
  afiliado: {
    nombre: 'MARÍA',
    apellidos: 'PRUEBA',
    dni: `${String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-8)}R`,
  },
})

async function adminWithKey() {
  const admin = await person(fx, 'admin')
  await admin.browser.call('POST', '/api/v1/organizations', {
    name: 'Altas',
    slug: `altas-${newId().slice(-12)}`,
  })
  const created = await admin.browser.call('POST', '/api/v1/integration-keys', { name: 'n8n' })
  expect(created.status).toBe(201)
  return { admin, token: created.body.token as string, keyId: created.body.key.id as string }
}

describe('affiliate intake endpoint', () => {
  it('needs a live key, and reports each item on its own', async () => {
    const { admin, token, keyId } = await adminWithKey()
    expect((await post(JSON.stringify([alta()]))).status).toBe(401)
    expect(
      (await post(JSON.stringify([alta()]), { authorization: 'Bearer kly_nope' })).status,
    ).toBe(401)

    const auth = { authorization: `Bearer ${token}` }
    const res = await post(JSON.stringify([alta(), { tipoSolicitud: 'baja' }]), auth)
    expect(res.status).toBe(202)
    const { results } = (await res.json()) as { results: { index: number; status: string }[] }
    expect(results.map((r) => [r.index, r.status])).toEqual([
      [0, 'RECEIVED'],
      [1, 'INVALID'],
    ])

    const count = await admin.browser.call('GET', '/api/v1/affiliate-requests/count')
    expect(count.body).toEqual({ open: 1 })

    await admin.browser.call('POST', `/api/v1/integration-keys/${keyId}/revoke`)
    expect((await post(JSON.stringify([alta()]), auth)).status).toBe(401)
  })

  it('refuses what is not JSON, empty, too many items or too large', async () => {
    const { token } = await adminWithKey()
    const auth = { authorization: `Bearer ${token}` }
    expect((await post('not json', auth)).status).toBe(400)
    expect((await post('[]', auth)).status).toBe(400)
    expect((await post(JSON.stringify(Array.from({ length: 51 }, alta)), auth)).status).toBe(400)
    expect((await post(`"${'x'.repeat(600 * 1024)}"`, auth)).status).toBe(413)
  })

  it('the administration routes need a session (who may use them is covered in core)', async () => {
    const anonymous = await api.request(`${ORIGIN}/api/v1/affiliate-requests`, {
      headers: { origin: ORIGIN },
    })
    expect(anonymous.status).toBe(401)
  })
})
