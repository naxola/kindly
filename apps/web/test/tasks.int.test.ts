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

describe('tasks through the API', () => {
  it('create, list, edit, complete and see only what the contact visibility allows', async () => {
    const admin = await person(fx, 'admin')
    expect(
      (
        await admin.browser.call('POST', '/api/v1/organizations', {
          name: 'Acme',
          slug: `acme-${newId().slice(-12)}`,
        })
      ).status,
    ).toBe(201)
    const delegate = await person(fx, 'delegate')
    await admin.browser.call('POST', '/api/v1/invitations', {
      email: delegate.email,
      firstName: 'Luis',
    })
    const token = await invitationToken(fx, delegate.email)
    await delegate.browser.call('POST', '/api/v1/invitations/accept', { token })
    const members = (await admin.browser.call('GET', '/api/v1/members')).body.items as {
      id: string
      email: string
    }[]
    const luisId = members.find((m) => m.email === delegate.email)!.id

    const hidden = (await admin.browser.call('POST', '/api/v1/contacts', { name: 'Del admin' }))
      .body.id as string

    // A general task assigned to the delegate, and one about the admin's contact.
    let res = await admin.browser.call('POST', '/api/v1/tasks', {
      title: 'Preparar la reunión',
      assigneeId: luisId,
      dueDate: '2026-12-01',
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      title: 'Preparar la reunión',
      completedAt: null,
      dueDate: '2026-12-01T00:00:00.000Z',
      assignee: { memberId: luisId, name: 'Luis' },
      contact: null,
    })
    const general = res.body.id as string
    res = await admin.browser.call('POST', '/api/v1/tasks', { title: 'Llamar', contactId: hidden })
    const onHidden = res.body.id as string

    // The delegate sees the general one only; the other looks inexistent everywhere.
    res = await delegate.browser.call('GET', '/api/v1/tasks')
    expect(res.body.items.map((t: { id: string }) => t.id)).toEqual([general])
    expect((await delegate.browser.call('GET', `/api/v1/tasks/${onHidden}`)).status).toBe(404)
    expect(
      (
        await delegate.browser.call('PUT', `/api/v1/tasks/${onHidden}/completed`, {
          completed: true,
        })
      ).status,
    ).toBe(404)
    res = await delegate.browser.call('POST', '/api/v1/tasks', { title: 'X', contactId: hidden })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toEqual([{ path: 'contactId', code: 'INVALID_CONTACT' }])
    expect(
      (await delegate.browser.call('POST', '/api/v1/tasks', { title: '' })).body.error.code,
    ).toBe('VALIDATION_FAILED')

    // Complete from the list, filter, edit and read the timeline.
    res = await delegate.browser.call('PUT', `/api/v1/tasks/${general}/completed`, {
      completed: true,
    })
    expect(res.body.completedAt).not.toBeNull()
    res = await admin.browser.call('GET', '/api/v1/tasks?status=pending')
    expect(res.body.items.map((t: { id: string }) => t.id)).toEqual([onHidden])
    res = await admin.browser.call('GET', '/api/v1/tasks?status=done')
    expect(res.body.items.map((t: { id: string }) => t.id)).toEqual([general])
    res = await admin.browser.call('PUT', `/api/v1/tasks/${general}`, {
      title: 'Preparar la reunión del lunes',
      completed: false,
    })
    expect(res.body).toMatchObject({ title: 'Preparar la reunión del lunes', completedAt: null })
    res = await admin.browser.call('GET', `/api/v1/tasks/${general}/activity`)
    expect(res.body.items.map((a: { type: string }) => a.type)).toEqual([
      'TASK_COMPLETED',
      'TASK_CREATED',
    ])
  })
})
