import { createDb, type Db } from '@saas/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuth } from '../src/auth/index.ts'
import { secretOf, totp } from './totp.ts'

let db: Db
const password = 'correct horse battery staple'
const S1 = 'first-secret-first-secret-first-0123456'
const S2 = 'second-secret-second-secret-second-0123'

const authWith = (secrets: { version: number; value: string }[]) =>
  createAuth({
    db,
    baseURL: 'http://localhost:3000',
    secret: secrets[0]!.value,
    secrets,
    rateLimit: false,
    requireEmailVerification: false,
  })

const cookieOf = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

beforeAll(() => {
  db = createDb({ connectionString: process.env.DATABASE_URL! })
})
afterAll(() => db.$disconnect())

/** A person with a session, ready to set up the second factor. */
async function person(auth: ReturnType<typeof authWith>) {
  const email = `mfa-${crypto.randomUUID()}@example.com`
  await auth.api.signUpEmail({ body: { email, password, name: 'Ana' } })
  const signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true })
  return { email, cookie: cookieOf(signedIn.headers) }
}

async function enable(auth: ReturnType<typeof authWith>, cookie: string) {
  const headers = new Headers({ cookie })
  const { totpURI, backupCodes } = await auth.api.enableTwoFactor({ body: { password }, headers })
  const secret = secretOf(totpURI)
  await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers })
  return { secret, backupCodes }
}

/** Sign in again: with MFA on, the password alone does not open a session. */
async function signInAgain(auth: ReturnType<typeof authWith>, email: string) {
  const res = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true })
  return { body: res.response as { twoFactorRedirect?: boolean }, cookie: cookieOf(res.headers) }
}

describe('second factor (R2.5, ADR 0016)', () => {
  it('setting it up needs the password, and it only protects the account once a code is verified', async () => {
    const auth = authWith([{ version: 1, value: S1 }])
    const { email, cookie } = await person(auth)
    const headers = new Headers({ cookie })
    await expect(
      auth.api.enableTwoFactor({ body: { password: 'not the password 123' }, headers }),
    ).rejects.toThrow()
    const { totpURI, backupCodes } = await auth.api.enableTwoFactor({ body: { password }, headers })
    expect(backupCodes).toHaveLength(10)
    // Not verified yet: signing in still works with the password alone.
    expect((await signInAgain(auth, email)).body.twoFactorRedirect).toBeFalsy()
    await auth.api.verifyTOTP({ body: { code: totp(secretOf(totpURI)) }, headers })
    expect((await signInAgain(auth, email)).body.twoFactorRedirect).toBe(true)
  })

  it('with it on, signing in asks for a code: a wrong one fails, the right one opens the session', async () => {
    const auth = authWith([{ version: 1, value: S1 }])
    const { email, cookie } = await person(auth)
    const { secret } = await enable(auth, cookie)
    const step = await signInAgain(auth, email)
    expect(step.body.twoFactorRedirect).toBe(true)
    const headers = new Headers({ cookie: step.cookie })
    await expect(auth.api.verifyTOTP({ body: { code: '000000' }, headers })).rejects.toThrow()
    const ok = await auth.api.verifyTOTP({
      body: { code: totp(secret) },
      headers,
      returnHeaders: true,
    })
    expect(cookieOf(ok.headers)).toContain('session_token')
  })

  it('a recovery code works once and never again', async () => {
    const auth = authWith([{ version: 1, value: S1 }])
    const { email, cookie } = await person(auth)
    const { backupCodes } = await enable(auth, cookie)
    const first = await signInAgain(auth, email)
    const used = await auth.api.verifyBackupCode({
      body: { code: backupCodes[0]! },
      headers: new Headers({ cookie: first.cookie }),
      returnHeaders: true,
    })
    expect(cookieOf(used.headers)).toContain('session_token')
    const second = await signInAgain(auth, email)
    await expect(
      auth.api.verifyBackupCode({
        body: { code: backupCodes[0]! },
        headers: new Headers({ cookie: second.cookie }),
      }),
    ).rejects.toThrow()
  })

  it('stores the secret and the recovery codes encrypted, never in the clear', async () => {
    const auth = authWith([{ version: 1, value: S1 }])
    const { email, cookie } = await person(auth)
    const { secret, backupCodes } = await enable(auth, cookie)
    const access = await db.authUser.findUniqueOrThrow({ where: { email } })
    const row = await db.authTwoFactor.findFirstOrThrow({ where: { userId: access.id } })
    expect(row.secret).not.toContain(secret)
    expect(row.backupCodes).not.toContain(backupCodes[0])
    expect(access.twoFactorEnabled).toBe(true)
  })

  it('locks the account after too many wrong codes, even with the right one afterwards', async () => {
    const auth = authWith([{ version: 1, value: S1 }])
    const { email, cookie } = await person(auth)
    const { secret } = await enable(auth, cookie)
    for (let i = 0; i < 10; i++) {
      const step = await signInAgain(auth, email)
      await auth.api
        .verifyTOTP({ body: { code: '000000' }, headers: new Headers({ cookie: step.cookie }) })
        .catch(() => undefined)
    }
    const step = await signInAgain(auth, email)
    await expect(
      auth.api.verifyTOTP({
        body: { code: totp(secret) },
        headers: new Headers({ cookie: step.cookie }),
      }),
    ).rejects.toThrow()
  })

  it('turning it off needs the password; afterwards the password alone opens a session again', async () => {
    const auth = authWith([{ version: 1, value: S1 }])
    const { email, cookie } = await person(auth)
    const { secret } = await enable(auth, cookie)
    // Better Auth ends the sessions that predate the factor: sign in again, with a code.
    const step = await signInAgain(auth, email)
    const session = await auth.api.verifyTOTP({
      body: { code: totp(secret) },
      headers: new Headers({ cookie: step.cookie }),
      returnHeaders: true,
    })
    const headers = new Headers({ cookie: cookieOf(session.headers) })
    await expect(
      auth.api.disableTwoFactor({ body: { password: 'not the password 123' }, headers }),
    ).rejects.toThrow()
    await auth.api.disableTwoFactor({ body: { password }, headers })
    expect((await signInAgain(auth, email)).body.twoFactorRedirect).toBeFalsy()
  })

  it('survives a secret rotation: the old secret stays in the list, dropping it breaks the factor', async () => {
    const v1 = authWith([{ version: 1, value: S1 }])
    const { email, cookie } = await person(v1)
    const { secret } = await enable(v1, cookie)

    // Rotated: the new secret is first, the old one only decrypts.
    const rotated = authWith([
      { version: 2, value: S2 },
      { version: 1, value: S1 },
    ])
    const step = await signInAgain(rotated, email)
    expect(step.body.twoFactorRedirect).toBe(true)
    const ok = await rotated.api.verifyTOTP({
      body: { code: totp(secret) },
      headers: new Headers({ cookie: step.cookie }),
      returnHeaders: true,
    })
    expect(cookieOf(ok.headers)).toContain('session_token')

    // The old secret was removed while a factor still depends on it: it cannot be decrypted.
    const dropped = authWith([{ version: 2, value: S2 }])
    const lost = await signInAgain(dropped, email)
    await expect(
      dropped.api.verifyTOTP({
        body: { code: totp(secret) },
        headers: new Headers({ cookie: lost.cookie }),
      }),
    ).rejects.toThrow()
  })
})
