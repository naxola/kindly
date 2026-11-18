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

/** An organization with its admin and one invited delegate (a plain MEMBER). */
async function team() {
  const admin = await person(fx, 'admin')
  const created = await admin.browser.call('POST', '/api/v1/organizations', {
    name: 'Acme',
    slug: `acme-${newId().slice(-12)}`,
  })
  expect(created.status).toBe(201)
  const delegate = await person(fx, 'delegate')
  expect(
    (
      await admin.browser.call('POST', '/api/v1/invitations', {
        email: delegate.email,
        firstName: 'Luis',
      })
    ).status,
  ).toBe(201)
  const token = await invitationToken(fx, delegate.email)
  expect(
    (await delegate.browser.call('POST', '/api/v1/invitations/accept', { token })).status,
  ).toBe(200)
  const members = (await admin.browser.call('GET', '/api/v1/members')).body.items as {
    id: string
    email: string
  }[]
  return {
    admin,
    delegate,
    adminMemberId: members.find((m) => m.email === admin.email)!.id,
    delegateMemberId: members.find((m) => m.email === delegate.email)!.id,
  }
}

describe('contacts through the API', () => {
  it('the delegate sees only their own; the admin reassigns and sees everything', async () => {
    const t = await team()

    // The delegate creates a contact: they become its reference delegate.
    let res = await t.delegate.browser.call('POST', '/api/v1/contacts', {
      name: 'Marta Gil',
      phone: '+34 600 111 222',
      email: 'marta@example.com',
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      name: 'Marta Gil',
      phone: '+34600111222',
      referenceDelegate: { memberId: t.delegateMemberId, name: 'Luis' },
    })
    const mine = res.body.id as string

    // The admin creates another one; the delegate does not see it (404, not 403).
    res = await t.admin.browser.call('POST', '/api/v1/contacts', { name: 'Del admin' })
    const theirs = res.body.id as string
    res = await t.delegate.browser.call('GET', '/api/v1/contacts')
    expect(res.body.items.map((c: { id: string }) => c.id)).toEqual([mine])
    expect((await t.delegate.browser.call('GET', `/api/v1/contacts/${theirs}`)).status).toBe(404)
    expect(
      (await t.delegate.browser.call('PUT', `/api/v1/contacts/${theirs}`, { name: 'X' })).status,
    ).toBe(404)
    expect(
      (await t.delegate.browser.call('GET', `/api/v1/contacts/${theirs}/activity`)).status,
    ).toBe(404)
    res = await t.admin.browser.call('GET', '/api/v1/contacts')
    expect(res.body.items).toHaveLength(2)

    // Edit with a normalized validation error for a malformed phone.
    res = await t.delegate.browser.call('PUT', `/api/v1/contacts/${mine}`, {
      name: 'Marta',
      phone: '600111222',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    res = await t.delegate.browser.call('PUT', `/api/v1/contacts/${mine}`, {
      name: 'Marta Gil Ruiz',
    })
    expect(res.body).toMatchObject({ name: 'Marta Gil Ruiz', phone: null })

    // Only an admin reassigns; the previous delegate loses the contact.
    res = await t.delegate.browser.call('PUT', `/api/v1/contacts/${mine}/delegate`, {
      delegateId: t.delegateMemberId,
    })
    expect(res.status).toBe(403)
    res = await t.admin.browser.call('PUT', `/api/v1/contacts/${mine}/delegate`, {
      delegateId: t.adminMemberId,
    })
    expect(res.status).toBe(200)
    expect(res.body.delegateId).toBe(t.adminMemberId)
    expect((await t.delegate.browser.call('GET', `/api/v1/contacts/${mine}`)).status).toBe(404)
    res = await t.admin.browser.call('PUT', `/api/v1/contacts/${mine}/delegate`, {
      delegateId: newId(),
    })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toEqual([{ path: 'delegateId', code: 'INVALID_DELEGATE' }])

    // History and timeline.
    res = await t.admin.browser.call('GET', `/api/v1/contacts/${mine}/delegates`)
    expect(res.body.items.map((a: { delegateName: string }) => a.delegateName)).toEqual([
      expect.any(String),
      'Luis',
    ])
    expect(res.body.items[1].endedAt).not.toBeNull()
    res = await t.admin.browser.call('GET', `/api/v1/contacts/${mine}/activity`)
    expect(res.body.items.map((a: { type: string }) => a.type)).toEqual([
      'CONTACT_DELEGATE_ASSIGNED',
      'CONTACT_UPDATED',
      'CONTACT_CREATED',
    ])
  })

  it('affiliation: alta, edit, leave and rejoin, with the fee rule computed by the server', async () => {
    const t = await team()
    const contact = (await t.delegate.browser.call('POST', '/api/v1/contacts', { name: 'Marta' }))
      .body.id as string
    const url = `/api/v1/contacts/${contact}/affiliation`

    let res = await t.delegate.browser.call('GET', url)
    expect(res.body).toEqual({ current: null, history: [] })

    res = await t.delegate.browser.call('POST', url, {
      memberNumber: '0042',
      startedAt: '2025-01-15',
      feePaidUntil: '2025-02',
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      status: 'ACTIVE',
      memberNumber: '0042',
      feePaidUntil: '2025-02-01',
      feeOverdue: true, // paid through Feb 2025: long behind
    })
    expect((await t.delegate.browser.call('POST', url, {})).status).toBe(409)

    res = await t.delegate.browser.call('PUT', url, {
      memberNumber: '0043',
      feePaidUntil: '2099-12',
    })
    expect(res.body).toMatchObject({ memberNumber: '0043', feeOverdue: false })
    expect((await t.delegate.browser.call('PUT', url, { feePaidUntil: '2026-13' })).status).toBe(
      400,
    )

    res = await t.delegate.browser.call('POST', `${url}/end`)
    expect(res.body.status).toBe('INACTIVE')
    expect((await t.delegate.browser.call('POST', `${url}/end`)).body.error.details).toEqual([
      { code: 'NO_ACTIVE_AFFILIATION' },
    ])
    expect((await t.delegate.browser.call('POST', url, { startedAt: '2026-03-01' })).status).toBe(
      201,
    )
    res = await t.delegate.browser.call('GET', url)
    expect(res.body.history.map((a: { status: string }) => a.status)).toEqual([
      'ACTIVE',
      'INACTIVE',
    ])

    // Nobody outside the contact's visibility touches it.
    const stranger = await person(fx, 'stranger')
    await stranger.browser.call('POST', '/api/v1/organizations', {
      name: 'Otra',
      slug: `otra-${newId().slice(-12)}`,
    })
    expect((await stranger.browser.call('GET', url)).status).toBe(404)
    expect((await stranger.browser.call('POST', url, {})).status).toBe(404)
  })

  it('requires a session', async () => {
    const res = await (await person(fx, 'nobody')).browser.call('GET', '/api/v1/contacts')
    expect(res.status).toBe(403) // signed in, but no active organization
  })
})
