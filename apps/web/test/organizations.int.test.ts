import { createDb, newId, type Db } from '@saas/database'
import { createHmac } from 'node:crypto'
import pg from 'pg'
import type * as core_ from '@saas/core'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { emailHash } from '@saas/adapters/email'
import { rateLimitKey } from '@saas/adapters/rate-limit'
import { api } from '../src/server/api/app.ts'
import {
  INVITATIONS_PER_ORGANIZATION_PER_DAY,
  SESSION_LIMIT_PER_MINUTE,
} from '../src/server/api/rate-limit.ts'

const core = vi.hoisted(() => ({ failAcceptOnce: false }))
// Wraps acceptInvitation so one test can make the step after the account creation fail.
vi.mock('@saas/core', async (original) => {
  const real = await original<typeof core_>()
  return {
    ...real,
    acceptInvitation: (...args: Parameters<typeof real.acceptInvitation>) => {
      if (core.failAcceptOnce) {
        core.failAcceptOnce = false
        throw new Error('boom: connection lost')
      }
      return real.acceptInvitation(...args)
    },
  }
})

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
  /** Each browser is a different client, so IP limits do not couple unrelated tests. */
  // Unique per browser (documentation range): the counters live in the database now, so two
  // browsers that drew the same address would share their limits.
  ip = `2001:db8::${newId().slice(-4)}:${newId().slice(-8, -4)}`

  async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const res = await api.request(`${ORIGIN}${path}`, {
      method,
      headers: {
        origin: ORIGIN,
        'x-test-ip': this.ip,
        ...extra,
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
    return { status: res.status, body: parsed, headers: res.headers }
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
    res = await owner.browser.call('POST', '/api/v1/invitations', { email: guest.email })
    expect(res.status).toBe(201)
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
    res = await owner.browser.call('PUT', `/api/v1/members/${ownerMember.id}/role`, {
      role: 'MEMBER',
    })
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ code: 'LAST_ADMIN' }])

    // A MEMBER cannot invite.
    res = await guest.browser.call('POST', '/api/v1/invitations', { email: 'x@example.com' })
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
    expect((await owner.browser.call('POST', '/api/v1/invitations', { email })).status).toBe(201)
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

  it('if joining fails after the account was created, it says so and signing in joins (R2.3)', async () => {
    const email = `half-${newId()}@example.com`
    const { token } = await ownerInviting(email)
    const guest = new Browser()
    core.failAcceptOnce = true
    let res = await guest.call('POST', '/api/v1/invitations/register', {
      token,
      name: 'Hana',
      password: PASSWORD,
    })
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ code: 'ACCOUNT_CREATED_JOIN_FAILED' }])
    expect(JSON.stringify(res.body)).not.toContain('boom')
    // The account exists and the invitation is still pending: signing in and accepting works.
    expect(await db.authUser.findUnique({ where: { email } })).not.toBeNull()
    res = await new Browser().call('POST', '/api/v1/invitations/preview', { token })
    expect(res.body).toMatchObject({ status: 'PENDING', emailRegistered: true })
    const again = new Browser()
    expect(
      (await again.call('POST', '/api/auth/sign-in/email', { email, password: PASSWORD })).status,
    ).toBe(200)
    res = await again.call('POST', '/api/v1/invitations/accept', { token })
    expect(res.status).toBe(200)
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

describe('activity through the API (R3.5, ADR 0018)', () => {
  it('an ADMIN pages through the activity; a MEMBER is refused; no IP in the answer', async () => {
    const owner = await person('activity-owner')
    await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Actividad',
      slug: `actividad-${newId().slice(-12)}`,
    })
    const guest = await person('activity-guest')
    await owner.browser.call('POST', '/api/v1/invitations', { email: guest.email })
    await guest.browser.call('POST', '/api/v1/invitations/accept', {
      token: await invitationToken(guest.email),
    })
    const first = await owner.browser.call('GET', '/api/v1/audit-logs?limit=2')
    expect(first.status).toBe(200)
    expect(first.body.items).toHaveLength(2)
    expect(first.body.items[0].action).toBe('invitation.accepted')
    expect(first.body.nextCursor).toBeTruthy()
    const second = await owner.browser.call(
      'GET',
      `/api/v1/audit-logs?limit=2&cursor=${encodeURIComponent(first.body.nextCursor as string)}`,
    )
    expect(second.body.items.map((i: { action: string }) => i.action)).toEqual([
      'organization.created',
    ])
    expect(second.body.nextCursor).toBeNull()
    expect(JSON.stringify(first.body)).not.toContain(owner.browser.ip)
    const filtered = await owner.browser.call('GET', '/api/v1/audit-logs?action=invitation.')
    expect(filtered.body.items).toHaveLength(2)
    expect((await guest.browser.call('GET', '/api/v1/audit-logs')).status).toBe(403)
    expect((await owner.browser.call('GET', '/api/v1/audit-logs?cursor=zzz')).status).toBe(400)
  })
})

describe('email provider webhook (R3.4, ADR 0017)', () => {
  const SECRET = `whsec_${Buffer.from('a-test-signing-key-of-32-bytes!!').toString('base64')}`
  const post = (body: string, headers: Record<string, string>) =>
    api.request(`${ORIGIN}/api/webhooks/email`, { method: 'POST', body, headers })
  const sign = (body: string, id: string) => {
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', Buffer.from(SECRET.slice(6), 'base64'))
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64')
    return { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` }
  }

  it('is off (404) without a secret; with one, a signed bounce suppresses the address once', async () => {
    const email = `bounce-${newId()}@example.com`
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { to: [email], bounce: { type: 'Permanent', subType: 'General', message: 'gone' } },
    })
    delete process.env.EMAIL_WEBHOOK_SECRET
    expect((await post(body, sign(body, 'msg_a'))).status).toBe(404)

    process.env.EMAIL_WEBHOOK_SECRET = SECRET
    try {
      // No session and no CSRF header: the signature is the authentication.
      expect((await post(body, sign(body, 'msg_a'))).status).toBe(200)
      // The provider retries with the same id: harmless.
      expect((await post(body, sign(body, 'msg_a'))).status).toBe(200)
      const rows = await db.emailSuppression.findMany({ where: { emailHash: emailHash(email) } })
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ reason: 'BOUNCE_PERMANENT', sourceEventId: 'msg_a' })

      const forged = await post(body, { ...sign(body, 'msg_b'), 'svix-signature': 'v1,AAAA' })
      expect(forged.status).toBe(401)
      const tampered = await post(body.replace('Permanent', 'Temporary'), sign(body, 'msg_c'))
      expect(tampered.status).toBe(401)
    } finally {
      delete process.env.EMAIL_WEBHOOK_SECRET
    }
  })
})

describe('persistent rate limits (R2.4, ADR 0015)', () => {
  /** Leaves a counter one request away from its limit, as if the window were almost used up. */
  const fill = (scope: string, id: string, count: number) =>
    db.rateLimit.upsert({
      where: { key: rateLimitKey(scope, id) },
      create: { key: rateLimitKey(scope, id), windowStart: new Date(), count },
      update: { windowStart: new Date(), count },
    })

  it('an organization cannot send more than its daily cap of invitations', async () => {
    const owner = await person('cap-owner')
    const created = await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Tope',
      slug: `tope-${newId().slice(-12)}`,
    })
    await fill('invitations', created.body.id as string, INVITATIONS_PER_ORGANIZATION_PER_DAY - 1)
    const ok = await owner.browser.call('POST', '/api/v1/invitations', {
      email: `cap-${newId()}@example.com`,
    })
    expect(ok.status).toBe(201)
    const refused = await owner.browser.call('POST', '/api/v1/invitations', {
      email: `cap-${newId()}@example.com`,
    })
    expect(refused.status).toBe(429)
    expect(refused.body.error.code).toBe('RATE_LIMITED')
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(3600)
    // Resending is an email too: it counts against the same cap.
    const again = await owner.browser.call('POST', `/api/v1/invitations/${ok.body.id}/resend`)
    expect(again.status).toBe(429)
  })

  it('a signed-in person is limited across /api/v1, without affecting anyone else', async () => {
    const busy = await person('busy')
    const calm = await person('calm')
    const access = await db.authUser.findUniqueOrThrow({ where: { email: busy.email } })
    await fill('api', access.id, SESSION_LIMIT_PER_MINUTE)
    const refused = await busy.browser.call('GET', '/api/v1/me')
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get('retry-after'))).toBeLessThanOrEqual(60)
    expect((await calm.browser.call('GET', '/api/v1/me')).status).toBe(200)
  })
})

describe('organization settings through the API (R4.4)', () => {
  async function orgWithMember() {
    const owner = await person('settings-owner')
    await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Ajustes',
      slug: `ajustes-${newId().slice(-12)}`,
    })
    const guest = await person('settings-guest')
    await owner.browser.call('POST', '/api/v1/invitations', { email: guest.email })
    const token = await invitationToken(guest.email)
    expect((await guest.browser.call('POST', '/api/v1/invitations/accept', { token })).status).toBe(
      200,
    )
    return { owner, guest, token }
  }

  it('an ADMIN renames the organization; a MEMBER cannot', async () => {
    const { owner, guest } = await orgWithMember()
    const res = await owner.browser.call('PATCH', '/api/v1/organization', {
      name: 'Ajustes Nuevos',
      defaultLocale: 'en',
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Ajustes Nuevos', defaultLocale: 'en' })
    expect(
      (await guest.browser.call('PATCH', '/api/v1/organization', { name: 'Nope' })).status,
    ).toBe(403)
    expect((await owner.browser.call('PATCH', '/api/v1/organization', {})).status).toBe(400)
  })

  it('a member leaves and loses access; the last ADMIN cannot leave', async () => {
    const { owner, guest } = await orgWithMember()
    expect((await guest.browser.call('POST', '/api/v1/me/organization/leave')).status).toBe(204)
    expect((await guest.browser.call('GET', '/api/v1/members')).status).not.toBe(200)
    const res = await owner.browser.call('POST', '/api/v1/me/organization/leave')
    expect(res.status).toBe(409)
    expect(res.body.error.details).toEqual([{ code: 'LAST_ADMIN' }])
  })

  it('archiving needs the exact name and closes the organization', async () => {
    const { owner } = await orgWithMember()
    let res = await owner.browser.call('POST', '/api/v1/organization/archive', {
      confirmName: 'otro nombre',
    })
    expect(res.status).toBe(400)
    expect(res.body.error.details).toEqual([{ path: 'confirmName', code: 'NAME_MISMATCH' }])
    res = await owner.browser.call('POST', '/api/v1/organization/archive', {
      confirmName: 'Ajustes',
    })
    expect(res.status).toBe(204)
    expect((await owner.browser.call('GET', '/api/v1/members')).status).not.toBe(200)
  })

  it('resending an invitation gives a new link and the old one stops working', async () => {
    const owner = await person('resend-owner')
    await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Reenvio',
      slug: `reenvio-${newId().slice(-12)}`,
    })
    const email = `resend-${newId()}@example.com`
    const created = await owner.browser.call('POST', '/api/v1/invitations', { email })
    const oldToken = await invitationToken(email)
    const res = await owner.browser.call('POST', `/api/v1/invitations/${created.body.id}/resend`)
    expect(res.status).toBe(200)
    const { rows } = await jobs.query(
      `SELECT data->'payload'->>'url' AS url FROM pgboss.job
       WHERE name = 'identity.invitation-email' AND data->'payload'->>'to' = $1`,
      [email],
    )
    expect(rows).toHaveLength(2)
    const tokens = rows.map((r) => new URL(r.url as string).hash.slice(1))
    const newToken = tokens.find((t) => t !== oldToken)!
    expect(
      (await new Browser().call('POST', '/api/v1/invitations/preview', { token: oldToken })).status,
    ).toBe(404)
    expect(
      (await new Browser().call('POST', '/api/v1/invitations/preview', { token: newToken })).status,
    ).toBe(200)
  })
})

describe('profile through the API (R4.3)', () => {
  it('a person changes their own name and language; /me shows it', async () => {
    const owner = await person('profile')
    // Entering the product creates the business user.
    await owner.browser.call('POST', '/api/v1/organizations', {
      name: 'Perfil',
      slug: `perfil-${newId().slice(-12)}`,
    })
    let res = await owner.browser.call('PATCH', '/api/v1/me', {
      displayName: '  Nuevo Nombre ',
      locale: 'en',
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ displayName: 'Nuevo Nombre', locale: 'en' })
    res = await owner.browser.call('GET', '/api/v1/me')
    expect(res.body.user).toMatchObject({ displayName: 'Nuevo Nombre', locale: 'en' })
    res = await owner.browser.call('PATCH', '/api/v1/me', { locale: null })
    expect(res.body.locale).toBeNull()
  })

  it('refuses invalid values, anonymous callers and people who have not entered yet', async () => {
    const entered = await person('profile-bad')
    await entered.browser.call('POST', '/api/v1/organizations', {
      name: 'Malo',
      slug: `malo-${newId().slice(-12)}`,
    })
    expect((await entered.browser.call('PATCH', '/api/v1/me', { displayName: ' ' })).status).toBe(
      400,
    )
    expect((await entered.browser.call('PATCH', '/api/v1/me', { locale: 'fr' })).status).toBe(400)
    expect((await new Browser().call('PATCH', '/api/v1/me', { displayName: 'X' })).status).toBe(401)
    const newcomer = await person('profile-new')
    expect((await newcomer.browser.call('PATCH', '/api/v1/me', { displayName: 'X' })).status).toBe(
      403,
    )
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
    await owner.browser.call('POST', '/api/v1/invitations', { email: guest.email, role: 'MEMBER' })
    const token = await invitationToken(guest.email)
    expect((await guest.browser.call('POST', '/api/v1/invitations/accept', { token })).status).toBe(
      200,
    )
    const refused = await guest.browser.call('GET', '/api/v1/billing')
    expect(refused.status).toBe(403)
    expect(refused.body.error.details[0].code).toBe('MISSING_PERMISSION')
  })

  it('IP limits ignore a forged x-forwarded-for and still apply per trusted IP (R1.2)', async () => {
    const attacker = new Browser()
    const token = 'x'.repeat(43)
    let last = 0
    for (let i = 0; i < 31; i++) {
      // A new forged forwarded address on every request: it must not give a fresh bucket.
      const res = await attacker.call(
        'POST',
        '/api/v1/invitations/preview',
        { token },
        {
          'x-forwarded-for': `192.0.2.${i + 1}`,
        },
      )
      last = res.status
    }
    expect(last).toBe(429)
    // Another client (another trusted IP) is not affected.
    const other = new Browser()
    expect((await other.call('POST', '/api/v1/invitations/preview', { token })).status).not.toBe(
      429,
    )
  })
})

describe('metrics (R5.4, ADR 0008)', () => {
  const read = (token?: string) =>
    api.request(`${ORIGIN}/api/metrics`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })

  it('does not exist without a token, refuses a wrong one and serves the right one', async () => {
    delete process.env.METRICS_TOKEN
    expect((await read()).status).toBe(404)
    process.env.METRICS_TOKEN = 'a-metrics-token-of-16+'
    try {
      expect((await read()).status).toBe(401)
      expect((await read('wrong-token-wrong-token')).status).toBe(401)
      // Some traffic, with ids in the path: the metrics keep only the route template.
      const owner = await person('metrics')
      const created = await owner.browser.call('POST', '/api/v1/organizations', {
        name: 'Metricas',
        slug: `metricas-${newId().slice(-12)}`,
      })
      await owner.browser.call('GET', '/api/v1/members')
      await owner.browser.call('PUT', `/api/v1/members/${newId()}/role`, { role: 'MEMBER' })
      const res = await read('a-metrics-token-of-16+')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/plain')
      const text = await res.text()
      expect(text).toContain('# TYPE http_requests_total counter')
      expect(text).toMatch(
        /http_requests_total\{method="GET",route="\/api\/v1\/members",status="2xx"\} \d+/,
      )
      expect(text).toContain('route="/api/v1/members/:id/role"')
      expect(text).toContain('http_request_duration_seconds_bucket{')
      expect(text).toContain('process_resident_memory_bytes')
      // Nothing that identifies a person or an organization.
      expect(text).not.toContain(created.body.id as string)
      expect(text).not.toContain(owner.email)
    } finally {
      delete process.env.METRICS_TOKEN
    }
  })
})
