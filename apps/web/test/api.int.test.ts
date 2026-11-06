import { createDb, type Db } from '@saas/database'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api } from '../src/server/api/app.ts'

let db: Db
let pgClient: pg.Client
const ORIGIN = 'http://localhost:3000'

beforeAll(async () => {
  process.env.APP_URL = ORIGIN
  db = createDb({ connectionString: process.env.DATABASE_URL! })
  // pg-boss tables belong to app_user (the role that runs the queue).
  pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await pgClient.connect()
})
afterAll(async () => {
  await db.$disconnect()
  await pgClient.end()
})

const request = (path: string, init: RequestInit = {}) =>
  api.request(`${ORIGIN}${path}`, {
    ...init,
    headers: { origin: ORIGIN, ...(init.headers as Record<string, string>) },
  })

const json = async (res: Response) => (await res.json()) as Record<string, any>

describe('ops', () => {
  it('health answers and propagates a valid correlation id', async () => {
    const res = await request('/api/health', { headers: { 'x-correlation-id': 'corr-12345678' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('x-correlation-id')).toBe('corr-12345678')
  })

  it('ready checks the database and the queue', async () => {
    const res = await request('/api/ready')
    expect(await json(res)).toEqual({ status: 'ok', checks: { database: 'ok', queue: 'ok' } })
  })
})

describe('normalized errors', () => {
  it('401 without session, with code and correlation id', async () => {
    const res = await request('/api/v1/me')
    expect(res.status).toBe(401)
    const body = await json(res)
    expect(body.error.code).toBe('UNAUTHENTICATED')
    expect(body.error.correlationId).toBe(res.headers.get('x-correlation-id'))
  })

  it('404 for unknown routes', async () => {
    const res = await request('/api/v1/nope')
    expect(res.status).toBe(404)
    expect((await json(res)).error.code).toBe('NOT_FOUND')
  })

  it('rejects cross-site state-changing requests (CSRF)', async () => {
    const res = await request('/api/v1/me', {
      method: 'POST',
      headers: { origin: 'https://evil.test' },
    })
    expect(res.status).toBe(403)
    expect((await json(res)).error.details).toEqual([{ code: 'CSRF' }])
  })
})

describe('access flow through the API', () => {
  it('sign-up enqueues the verification email; after verifying, /me answers', async () => {
    const email = `web-${crypto.randomUUID()}@example.com`
    const password = 'correct horse battery staple'
    const signUp = await request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: 'Ana' }),
    })
    expect(signUp.status).toBe(200)

    // The email is not sent by the web: it is a job for the worker.
    const { rows } = await pgClient.query(
      `SELECT data FROM pgboss.job WHERE name = 'identity.verification-email'
         AND data->'payload'->>'to' = $1`,
      [email],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].data.payload.url).toContain('/api/auth/verify-email?token=')

    // Unverified accounts cannot sign in.
    const blocked = await request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    expect(blocked.status).toBe(403)

    // Following the emailed link verifies the address.
    const link = new URL(rows[0].data.payload.url as string)
    const verify = await request(`${link.pathname}${link.search}`)
    expect([200, 302]).toContain(verify.status)

    const signIn = await request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    expect(signIn.status).toBe(200)
    const cookie = signIn.headers.get('set-cookie')!.split(';')[0]!

    const me = await request('/api/v1/me', { headers: { cookie } })
    expect(me.status).toBe(200)
    // Signed in, but has not entered the product yet: no business user (ADR 0003).
    expect(await json(me)).toEqual({
      access: { email, emailVerified: true },
      user: null,
      activeOrganizationId: null,
      organizations: [],
    })
  })
})
