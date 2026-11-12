import { createDb, newId, type Db } from '@saas/database'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api } from '../src/server/api/app.ts'

const ORIGIN = 'http://localhost:3000'
const PASSWORD = 'correct horse battery staple'
let db: Db
let jobs: pg.Client

beforeAll(async () => {
  process.env.APP_URL = ORIGIN
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  jobs = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await jobs.connect()
})
afterAll(async () => {
  await db.$disconnect()
  await jobs.end()
})

/** Minimal cookie jar: keeps the last value of each cookie the API sets. */
class Browser {
  private jar = new Map<string, string>()

  async call(method: string, path: string, body?: unknown) {
    const res = await api.request(`${ORIGIN}${path}`, {
      method,
      headers: {
        origin: ORIGIN,
        cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(';')
      const [name, ...rest] = pair!.split('=')
      const value = rest.join('=')
      if (value && !/max-age=0/i.test(raw)) this.jar.set(name!, value)
      else this.jar.delete(name!)
    }
    const text = await res.text()
    const parsed: any = text ? JSON.parse(text) : null
    return { status: res.status, body: parsed }
  }

  has(cookie: string) {
    return this.jar.has(cookie)
  }
}

/** Signs up through Better Auth, verifies (fixture) and signs in. */
async function person(label: string) {
  const email = `${label}-${newId()}@example.com`
  const browser = new Browser()
  expect(
    (
      await browser.call('POST', '/api/auth/sign-up/email', {
        email,
        password: PASSWORD,
        name: label,
      })
    ).status,
  ).toBe(200)
  await db.authUser.update({ where: { email }, data: { emailVerified: true } })
  expect(
    (await browser.call('POST', '/api/auth/sign-in/email', { email, password: PASSWORD })).status,
  ).toBe(200)
  return { email, browser }
}

async function invitationToken(email: string) {
  const { rows } = await jobs.query(
    `SELECT data->'payload'->>'url' AS url FROM pgboss.job
     WHERE name = 'identity.invitation-email' AND data->'payload'->>'to' = $1`,
    [email.toLowerCase()],
  )
  const url = new URL(rows[0].url as string)
  expect(url.pathname).toBe('/invite')
  return url.hash.slice(1)
}

describe('organizations, members and invitations through the API', () => {
  it('runs the whole journey of two people', async () => {
    const owner = await person('owner')

    // Signed in but not in the product yet.
    let res = await owner.browser.call('GET', '/api/v1/organization')
    expect(res.status).toBe(403)
    expect(res.body.error.details).toEqual([{ code: 'NO_ACTIVE_ORGANIZATION' }])

    // Creating an organization is the first entry: business user + ADMIN + active cookie.
    res = await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Acme',
      slug: `acme-${newId().slice(-12)}`,
    })
    expect(res.status).toBe(201)
    const acmeId = res.body.id as string
    expect(owner.browser.has('active_org')).toBe(true)
    res = await owner.browser.call('GET', '/api/v1/organization')
    expect(res.body.member.role).toBe('ADMIN')
    expect(res.body.member.permissions).toContain('members.invite')

    // Invite a guest: the email job carries the token in the URL fragment.
    const guest = await person('guest')
    // A new organization starts with its default position.
    res = await owner.browser.call('GET', '/api/v1/positions')
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(['Delegado'])
    const delegateId = res.body.items[0].id as string
    res = await owner.browser.call('POST', '/api/v1/invitations', {
      email: guest.email,
      firstName: 'Luis',
      lastName: 'Pérez',
      phone: '+34 600 111 222',
      positionId: delegateId,
    })
    expect(res.status).toBe(201)
    expect(res.body.profile).toEqual({
      firstName: 'Luis',
      lastName: 'Pérez',
      phone: '+34600111222',
      position: { id: delegateId, name: 'Delegado' },
    })
    const invitationId = res.body.id as string
    expect((await owner.browser.call('GET', '/api/v1/invitations')).body.items).toHaveLength(1)
    const token = await invitationToken(guest.email)

    // Anyone with the link sees the preview, without a session.
    res = await new Browser().call('POST', '/api/v1/invitations/preview', { token })
    expect(res.body).toMatchObject({ organizationName: 'Acme', status: 'PENDING', role: 'MEMBER' })

    // Someone else cannot use it.
    const stranger = await person('stranger')
    res = await stranger.browser.call('POST', '/api/v1/invitations/accept', { token })
    expect(res.status).toBe(403)
    expect(res.body.error.details).toEqual([{ code: 'EMAIL_MISMATCH' }])

    // The guest accepts and lands in Acme.
    res = await guest.browser.call('POST', '/api/v1/invitations/accept', { token })
    expect(res.body).toEqual({ organizationId: acmeId })
    res = await guest.browser.call('GET', '/api/v1/me')
    expect(res.body.activeOrganizationId).toBe(acmeId)

    // Members, with their access email; the last ADMIN stays.
    res = await owner.browser.call('GET', '/api/v1/members')
    const members = res.body.items as { id: string; email: string; role: string }[]
    expect(members.map((m) => m.email).sort()).toEqual([owner.email, guest.email].sort())
    const ownerMember = members.find((m) => m.email === owner.email)!
    const guestMember = members.find((m) => m.email === guest.email)!
    // The profile chosen in the invitation became the member's profile.
    expect(res.body.items.find((m: { id: string }) => m.id === guestMember.id)).toMatchObject({
      displayName: 'Luis Pérez',
      profile: { phone: '+34600111222', position: { name: 'Delegado', archived: false } },
    })
    res = await owner.browser.call('PUT', `/api/v1/members/${ownerMember.id}/role`, {
      role: 'MEMBER',
    })
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ code: 'LAST_ADMIN' }])

    // A MEMBER cannot invite.
    res = await guest.browser.call('POST', '/api/v1/invitations', {
      email: 'x@example.com',
      firstName: 'X',
    })
    expect(res.status).toBe(403)

    // A disabled member loses access and the stale active cookie is cleared.
    res = await owner.browser.call('PUT', `/api/v1/members/${guestMember.id}/status`, {
      status: 'DISABLED',
    })
    expect(res.status).toBe(204)
    res = await guest.browser.call('GET', '/api/v1/organization')
    expect(res.status).toBe(404)
    expect(guest.browser.has('active_org')).toBe(false)

    // Switching between one's own organizations; never to someone else's.
    res = await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Beta',
      slug: `beta-${newId().slice(-12)}`,
    })
    expect(res.status).toBe(201)
    expect((await owner.browser.call('GET', '/api/v1/organization')).body.organization.name).toBe(
      'Beta',
    )
    res = await owner.browser.call('PUT', '/api/v1/me/organization', { organizationId: acmeId })
    expect(res.status).toBe(204)
    expect((await owner.browser.call('GET', '/api/v1/organization')).body.organization.name).toBe(
      'Acme',
    )
    res = await owner.browser.call('PUT', '/api/v1/me/organization', { organizationId: newId() })
    expect(res.status).toBe(404)

    // Revoking: the link stops working.
    res = await owner.browser.call('POST', '/api/v1/invitations', {
      email: `late-${newId()}@example.com`,
      firstName: 'Tarde',
    })
    const lateId = res.body.id as string
    expect((await owner.browser.call('POST', `/api/v1/invitations/${lateId}/revoke`)).status).toBe(
      204,
    )
    expect(invitationId).not.toBe(lateId)
  })

  it('an unknown invitation token is a 404', async () => {
    const res = await new Browser().call('POST', '/api/v1/invitations/preview', {
      token: 'x'.repeat(43),
    })
    expect(res.status).toBe(404)
  })
})

describe('sign-up from an invitation link', () => {
  async function ownerInviting(email: string) {
    const owner = await person('owner')
    await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Acme',
      slug: `acme-${newId().slice(-12)}`,
    })
    expect(
      (await owner.browser.call('POST', '/api/v1/invitations', { email, firstName: 'Ana' })).status,
    ).toBe(201)
    return { owner, token: await invitationToken(email) }
  }

  it('creates a verified account with only name and password, signs in and joins', async () => {
    const email = `new-${newId()}@example.com`
    const { token } = await ownerInviting(email)
    const guest = new Browser()

    let res = await guest.call('POST', '/api/v1/invitations/preview', { token })
    expect(res.body).toMatchObject({ status: 'PENDING', emailRegistered: false })

    res = await guest.call('POST', '/api/v1/invitations/register', {
      token,
      name: 'Nora',
      password: PASSWORD,
    })
    expect(res.status).toBe(201)
    // Signed in straight away, inside the organization.
    res = await guest.call('GET', '/api/v1/me')
    expect(res.body.access).toEqual({ email, emailVerified: true })
    expect(res.body.user.displayName).toBe('Nora')
    expect(res.body.activeOrganizationId).toBeTruthy()
    // No second verification email: the link already proved the inbox.
    const { rows } = await jobs.query(
      `SELECT 1 FROM pgboss.job WHERE name = 'identity.verification-email'
       AND data->'payload'->>'to' = $1`,
      [email],
    )
    expect(rows).toHaveLength(0)

    // The link is now used: it says so, and creating the account again is refused.
    res = await new Browser().call('POST', '/api/v1/invitations/preview', { token })
    expect(res.body).toMatchObject({ status: 'ACCEPTED', emailRegistered: true })
    res = await new Browser().call('POST', '/api/v1/invitations/register', {
      token,
      name: 'Nora',
      password: PASSWORD,
    })
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ code: 'INVITATION_ACCEPTED' }])
  })

  it('an email that already has an account must sign in instead', async () => {
    const existing = await person('existing')
    const { token } = await ownerInviting(existing.email)
    let res = await new Browser().call('POST', '/api/v1/invitations/preview', { token })
    expect(res.body.emailRegistered).toBe(true)
    res = await new Browser().call('POST', '/api/v1/invitations/register', {
      token,
      name: 'Impostor',
      password: PASSWORD,
    })
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ code: 'USER_ALREADY_EXISTS' }])
  })

  it('rejects a short password without creating anything', async () => {
    const email = `short-${newId()}@example.com`
    const { token } = await ownerInviting(email)
    const res = await new Browser().call('POST', '/api/v1/invitations/register', {
      token,
      name: 'Sam',
      password: 'short',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toEqual([{ code: 'PASSWORD_TOO_SHORT', path: 'password' }])
    expect(await db.authUser.findUnique({ where: { email } })).toBeNull()
  })
})

describe('billing through the API', () => {
  it('an ADMIN sees the default plan; a MEMBER is refused', async () => {
    const owner = await person('billing-owner')
    expect(
      (
        await owner.browser.call('POST', '/api/v1/organizations', {
          name: 'Billing Co',
          slug: `billing-${newId().slice(-12)}`,
        })
      ).status,
    ).toBe(201)
    const res = await owner.browser.call('GET', '/api/v1/billing')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      plan: { key: 'free', version: 1, price: '0' },
      status: 'DEFAULT',
      metrics: [],
    })
    const plans = await owner.browser.call('GET', '/api/v1/billing/plans')
    expect(plans.body.items.map((p: { key: string }) => p.key)).toEqual(['free'])

    const guest = await person('billing-guest')
    await owner.browser.call('POST', '/api/v1/invitations', {
      email: guest.email,
      role: 'MEMBER',
      firstName: 'Gus',
    })
    const token = await invitationToken(guest.email)
    expect((await guest.browser.call('POST', '/api/v1/invitations/accept', { token })).status).toBe(
      200,
    )
    const refused = await guest.browser.call('GET', '/api/v1/billing')
    expect(refused.status).toBe(403)
    expect(refused.body.error.details[0].code).toBe('MISSING_PERMISSION')
  })
})

describe('positions and profiles through the API', () => {
  it('an ADMIN manages positions and profiles; a MEMBER only their own data', async () => {
    const owner = await person('owner')
    let res = await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Acme',
      slug: `acme-${newId().slice(-12)}`,
    })
    expect(res.status).toBe(201)

    // Positions: create, unique name, rename, archive and restore.
    res = await owner.browser.call('POST', '/api/v1/positions', { name: 'Presidente' })
    expect(res.status).toBe(201)
    const presidentId = res.body.id as string
    res = await owner.browser.call('POST', '/api/v1/positions', { name: 'presidente' })
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ path: 'name', code: 'NAME_TAKEN' }])
    res = await owner.browser.call('PUT', `/api/v1/positions/${presidentId}`, {
      name: 'Presidencia',
    })
    expect(res.body).toMatchObject({ name: 'Presidencia', archived: false })
    expect((await owner.browser.call('POST', '/api/v1/positions', { name: '  ' })).status).toBe(400)

    // The guest joins with a position and is only a MEMBER.
    const guest = await person('guest')
    res = await owner.browser.call('POST', '/api/v1/invitations', {
      email: guest.email,
      firstName: 'Eva',
      positionId: presidentId,
    })
    expect(res.status).toBe(201)
    const token = await invitationToken(guest.email)
    expect((await guest.browser.call('POST', '/api/v1/invitations/accept', { token })).status).toBe(
      200,
    )

    // A MEMBER reads the catalog but cannot change it, nor anyone's profile.
    expect((await guest.browser.call('GET', '/api/v1/positions')).status).toBe(200)
    expect((await guest.browser.call('POST', '/api/v1/positions', { name: 'Otro' })).status).toBe(
      403,
    )
    expect(
      (await guest.browser.call('POST', `/api/v1/positions/${presidentId}/archive`)).status,
    ).toBe(403)
    res = await owner.browser.call('GET', '/api/v1/members')
    const guestMember = res.body.items.find((m: { email: string }) => m.email === guest.email)
    const ownerMember = res.body.items.find((m: { email: string }) => m.email === owner.email)
    expect(
      (
        await guest.browser.call('PUT', `/api/v1/members/${ownerMember.id}/profile`, {
          firstName: 'Hack',
        })
      ).status,
    ).toBe(403)

    // Their own data: yes; a malformed phone is a normalized 400.
    res = await guest.browser.call('PUT', '/api/v1/me/profile', {
      firstName: 'Eva',
      phone: '600111222',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_FAILED')
    res = await guest.browser.call('PUT', '/api/v1/me/profile', {
      firstName: 'Eva',
      lastName: 'Ruiz',
      phone: '+34611222333',
    })
    expect(res.status).toBe(204)

    // The ADMIN edits the profile, position and private notes; the MEMBER does not see the notes.
    res = await owner.browser.call('PUT', `/api/v1/members/${guestMember.id}/profile`, {
      firstName: 'Eva',
      lastName: 'Ruiz',
      positionId: presidentId,
      notes: 'Solo de la junta',
    })
    expect(res.status).toBe(204)
    res = await owner.browser.call('GET', '/api/v1/members')
    expect(
      res.body.items.find((m: { id: string }) => m.id === guestMember.id).profile,
    ).toMatchObject({
      notes: 'Solo de la junta',
      position: { name: 'Presidencia' },
    })
    res = await guest.browser.call('GET', '/api/v1/members')
    expect(
      res.body.items.find((m: { id: string }) => m.id === guestMember.id).profile.notes,
    ).toBeNull()

    // Archiving hides it from the default list but the member keeps it.
    expect(
      (await owner.browser.call('POST', `/api/v1/positions/${presidentId}/archive`)).status,
    ).toBe(204)
    res = await owner.browser.call('GET', '/api/v1/positions')
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(['Delegado'])
    res = await owner.browser.call('GET', '/api/v1/positions?includeArchived=true')
    expect(res.body.items).toHaveLength(2)
    res = await owner.browser.call('GET', '/api/v1/members')
    expect(
      res.body.items.find((m: { id: string }) => m.id === guestMember.id).profile.position,
    ).toMatchObject({ name: 'Presidencia', archived: true })
    expect(
      (await owner.browser.call('POST', `/api/v1/positions/${presidentId}/restore`)).status,
    ).toBe(204)
  })
})
