import { createMessagingRegistry, FakeMessagingAdapter, PREFLIGHT_CHECK_IDS } from '@saas/core'
import { newId } from '@saas/database'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setMessagingForTests } from '../src/server/messaging.ts'
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
afterEach(() => setMessagingForTests(undefined))

const direct = new FakeMessagingAdapter('s3cret')
const guided = new FakeMessagingAdapter('s3cret', {
  channel: 'guided',
  onboarding: 'WHATSAPP_COEXISTENCE',
  canDisconnect: false,
})

describe('channels through the API', () => {
  it('each person connects their own accounts; administrators see all; guided channels need every point', async () => {
    setMessagingForTests(createMessagingRegistry([direct, guided]))
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

    // What exists: the channels, and the onboarding the screen needs (no country list: cannot check).
    let res = await delegate.browser.call('GET', '/api/v1/channels')
    expect(res.status).toBe(200)
    expect(res.body.channels.map((c: { channel: string }) => c.channel)).toEqual(['fake', 'guided'])
    expect(res.body.onboarding).toMatchObject({
      checks: [...PREFLIGHT_CHECK_IDS],
      countryCheckAvailable: false,
    })
    expect(res.body.onboarding.paths).toContainEqual({ id: 'COEXISTENCE', available: true })

    // A direct channel connects in one step; its body never carries the credentials pointer.
    res = await delegate.browser.call('POST', '/api/v1/channels/accounts', { channel: 'fake' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'CONNECTED', tone: 'ok', canDisconnect: true })
    expect(JSON.stringify(res.body)).not.toContain('credentials')
    const own = res.body.id as string

    // A guided one does not: 409 until the onboarding is walked through.
    res = await delegate.browser.call('POST', '/api/v1/channels/accounts', { channel: 'guided' })
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ code: 'ONBOARDING_REQUIRED' }])
    const body = { channel: 'guided', path: 'COEXISTENCE' }
    res = await delegate.browser.call('POST', '/api/v1/channels/accounts/onboarding', {
      ...body,
      acknowledged: ['business-app'],
    })
    expect(res.status).toBe(400)
    res = await admin.browser.call('POST', '/api/v1/channels/accounts/onboarding', {
      ...body,
      acknowledged: [...PREFLIGHT_CHECK_IDS],
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ canDisconnect: false })
    const guidedId = res.body.id as string

    // Visibility: Luis only his own; the administrator both, with names.
    res = await delegate.browser.call('GET', '/api/v1/channels')
    expect(res.body.accounts.map((a: { id: string }) => a.id)).toEqual([own])
    res = await admin.browser.call('GET', '/api/v1/channels')
    expect(res.body.accounts).toHaveLength(2)
    expect(res.body.accounts.find((a: { id: string }) => a.id === own).delegateName).toBe('Luis')

    // Disconnecting: not someone else's (404 for a delegate), not what only the phone can end (409),
    // yes the own one; an administrator may disconnect a delegate's (offboarding).
    expect(
      (await delegate.browser.call('POST', `/api/v1/channels/accounts/${guidedId}/disconnect`))
        .status,
    ).toBe(404)
    res = await admin.browser.call('POST', `/api/v1/channels/accounts/${guidedId}/disconnect`)
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ code: 'CANNOT_DISCONNECT_FROM_KINDLY' }])
    expect(
      (await delegate.browser.call('POST', `/api/v1/channels/accounts/${own}/disconnect`)).status,
    ).toBe(204)
    res = await admin.browser.call('GET', '/api/v1/channels')
    expect(res.body.accounts.find((a: { id: string }) => a.id === own).status).toBe('DISCONNECTED')
  })
})
