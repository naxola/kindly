import { newId } from '@saas/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  closeFixtures,
  invitationToken,
  openFixtures,
  person,
  type Fixtures,
} from './api-helpers.ts'

let fx: Fixtures
beforeAll(async () => {
  fx = await openFixtures()
})
afterAll(() => closeFixtures(fx))

describe('procedures through the API', () => {
  it('administrators write, everyone reads, another organization sees nothing', async () => {
    const admin = await person(fx, 'admin')
    await admin.browser.call('POST', '/api/v1/organizations', {
      name: 'Acme',
      slug: `acme-${newId().slice(-12)}`,
    })
    const delegate = await person(fx, 'delegate')
    await admin.browser.call('POST', '/api/v1/invitations', {
      email: delegate.email,
      firstName: 'Luis',
    })
    await delegate.browser.call('POST', '/api/v1/invitations/accept', {
      token: await invitationToken(fx, delegate.email),
    })

    let res = await admin.browser.call('POST', '/api/v1/procedures', {
      name: 'Baja por IT',
      steps: ['Uno', ' Dos ', 'Uno', ''],
      requiredDocuments: ['DNI'],
    })
    expect(res.status).toBe(201)
    const id = res.body.id as string
    res = await admin.browser.call('POST', `/api/v1/procedures/${id}/versions`, {
      steps: ['Solo uno'],
    })
    expect(res.body).toMatchObject({ version: 2 })

    res = await delegate.browser.call('GET', `/api/v1/procedures/${id}`)
    expect(res.status).toBe(200)
    expect(
      res.body.versions.map((v: { version: number; status: string }) => [v.version, v.status]),
    ).toEqual([
      [2, 'CURRENT'],
      [1, 'SUPERSEDED'],
    ])
    expect(res.body.versions[1].steps.map((s: { title: string }) => s.title)).toEqual([
      'Uno',
      'Dos',
    ])
    expect((await delegate.browser.call('GET', '/api/v1/procedures')).body.items).toEqual([
      { id, name: 'Baja por IT', description: null, currentVersion: 2 },
    ])
    expect((await delegate.browser.call('POST', '/api/v1/procedures', { name: 'X' })).status).toBe(
      403,
    )
    expect(
      (await delegate.browser.call('POST', `/api/v1/procedures/${id}/versions`, {})).status,
    ).toBe(403)
    expect((await admin.browser.call('POST', '/api/v1/procedures', { name: '' })).status).toBe(400)

    const other = await person(fx, 'other')
    await other.browser.call('POST', '/api/v1/organizations', {
      name: 'Otra',
      slug: `otra-${newId().slice(-12)}`,
    })
    expect((await other.browser.call('GET', `/api/v1/procedures/${id}`)).status).toBe(404)
    expect((await other.browser.call('POST', `/api/v1/procedures/${id}/versions`, {})).status).toBe(
      404,
    )
    expect((await other.browser.call('GET', '/api/v1/procedures')).body.items).toEqual([])
  })
})
