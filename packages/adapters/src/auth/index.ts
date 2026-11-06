import { newId, type Db } from '@saas/database'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'

/**
 * Access layer (ADR 0003): Better Auth on the auth_* tables. It only knows who can sign
 * in — no business data, no active organization. Authorization lives in core.
 */

/** Better Auth routes under the app (`/api/auth/*`), outside `/api/v1` and its OpenAPI. */
export const AUTH_BASE_PATH = '/api/auth'

/** SUPUESTO (OWASP ASVS 2.1.1/2.1.2): passwords from 12 to 128 characters. */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

const ONE_HOUR = 60 * 60

export interface AuthEmail {
  to: string
  name: string
  url: string
  /** Raw one-time token: use it only to derive an idempotency key, never log it. */
  token: string
}

export interface CreateAuthOptions {
  db: Db
  /** Public URL of the app (APP_URL). */
  baseURL: string
  /** At least 32 characters. */
  secret: string
  rateLimit: boolean
  /** Default true. Only disable in tests or local tools. */
  requireEmailVerification?: boolean
  /**
   * Delivery of the access emails. In the apps, use `queuedAuthEmails(db, queue)`:
   * Better Auth enqueues and the worker sends (async, idempotent). Tests capture them.
   */
  sendVerificationEmail?: (email: AuthEmail) => Promise<void>
  sendResetPasswordEmail?: (email: AuthEmail) => Promise<void>
}

const missingSender = (kind: string) => () =>
  Promise.reject(new Error(`No sender configured for ${kind} emails`))

export function createAuth({
  db,
  baseURL,
  secret,
  rateLimit,
  requireEmailVerification = true,
  sendVerificationEmail = missingSender('verification'),
  sendResetPasswordEmail = missingSender('password reset'),
}: CreateAuthOptions) {
  const secure = baseURL.startsWith('https://')
  return betterAuth({
    baseURL,
    basePath: AUTH_BASE_PATH,
    secret,
    database: prismaAdapter(db, { provider: 'postgresql' }),
    telemetry: { enabled: false },
    // Access tables carry the auth_ prefix (Prisma models AuthUser, AuthSession…).
    user: { modelName: 'authUser' },
    session: {
      modelName: 'authSession',
      expiresIn: 7 * 24 * ONE_HOUR,
      updateAge: 24 * ONE_HOUR,
      // No cookie cache: a revoked session stops working on the next request.
      cookieCache: { enabled: false },
    },
    account: { modelName: 'authAccount' },
    verification: { modelName: 'authVerification' },
    advanced: {
      database: { generateId: () => newId() },
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
    },
    rateLimit: {
      enabled: rateLimit,
      window: 60,
      max: 100,
      // SUPUESTO: per-IP, per-minute limits on sensitive endpoints.
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      autoSignIn: false,
      resetPasswordTokenExpiresIn: ONE_HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url, token }) =>
        sendResetPasswordEmail({ to: user.email, name: user.name, url, token }),
    },
    emailVerification: {
      sendOnSignUp: requireEmailVerification,
      sendOnSignIn: requireEmailVerification,
      autoSignInAfterVerification: true,
      expiresIn: ONE_HOUR,
      sendVerificationEmail: ({ user, url, token }) =>
        sendVerificationEmail({ to: user.email, name: user.name, url, token }),
    },
  })
}

export type Auth = ReturnType<typeof createAuth>

export { queuedAuthEmails } from './queued-emails.ts'
export { createInvitedAccount } from './invited-account.ts'
export type { InvitedAccountResult } from './invited-account.ts'
