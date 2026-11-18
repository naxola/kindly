import { createDb, newId, type Db } from '@saas/database'
import pg from 'pg'
import { expect } from 'vitest'
import { api } from '../src/server/api/app.ts'

/** Fixtures for the API integration tests: a cookie jar, sign-up through Better Auth, invitations. */
export const ORIGIN = 'http://localhost:3000'
export const PASSWORD = 'correct horse battery staple'

export interface Fixtures {
  db: Db
  jobs: pg.Client
}

export async function openFixtures(): Promise<Fixtures> {
  process.env.APP_URL = ORIGIN
  const db = createDb({ connectionString: process.env.DATABASE_URL! })
  const jobs = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await jobs.connect()
  return { db, jobs }
}

export async function closeFixtures({ db, jobs }: Fixtures) {
  await db.$disconnect()
  await jobs.end()
}

/** Minimal cookie jar: keeps the last value of each cookie the API sets. */
export class Browser {
  private jar = new Map<string, string>()

  async call(method: string, path: string, body?: unknown) {
    const res = await api.request(`${ORIGIN}${path}`, {
      method,
      headers: {
        origin: ORIGIN,
        cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '),
        ...(body !== undefined && !(body instanceof FormData)
          ? { 'content-type': 'application/json' }
          : {}),
      },
      ...(body !== undefined
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
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
}

/** Signs up through Better Auth, verifies (fixture) and signs in. */
export async function person({ db }: Fixtures, label: string) {
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

export async function invitationToken({ jobs }: Fixtures, email: string) {
  const { rows } = await jobs.query(
    `SELECT data->'payload'->>'url' AS url FROM pgboss.job
     WHERE name = 'identity.invitation-email' AND data->'payload'->>'to' = $1`,
    [email.toLowerCase()],
  )
  return new URL(rows[0].url as string).hash.slice(1)
}
