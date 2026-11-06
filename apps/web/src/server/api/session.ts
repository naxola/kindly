import { DomainError, findUserByAuthId, type BaseCtx } from '@saas/core'
import type { User } from '@saas/database'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { auth } from '../auth.ts'
import { db } from '../db.ts'
import { env } from '../env.ts'
import { queue } from '../queue.ts'
import type { ApiEnv, SessionAccess } from './types.ts'

/** Resolves the Better Auth session (cookie) if any. Does not require authentication. */
export const session = createMiddleware<ApiEnv>(async (c, next) => {
  // returnHeaders: if Better Auth refreshes the session, the new cookie goes back to the client.
  const { headers: authHeaders, response: result } = await auth().api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  })
  if (result) {
    c.set('access', {
      authUserId: result.user.id,
      email: result.user.email,
      name: result.user.name,
      emailVerified: result.user.emailVerified,
    })
    c.set('log', c.get('log').child({ authUserId: result.user.id }))
  }
  await next()
  for (const cookie of authHeaders.getSetCookie()) c.res.headers.append('set-cookie', cookie)
})

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defense of the cookie API (on top of SameSite=Lax): rejects state-changing requests
 * when the browser says they come from another site or origin.
 */
export const csrfGuard = createMiddleware<ApiEnv>(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header('origin')
    const site = c.req.header('sec-fetch-site')
    if (site === 'cross-site' || (origin && origin !== new URL(env().APP_URL).origin)) {
      throw new DomainError('FORBIDDEN', 'Cross-site request rejected', [{ code: 'CSRF' }])
    }
  }
  await next()
})

/** Use-case context shared by every route. */
export async function baseCtx(c: Context<ApiEnv>): Promise<BaseCtx> {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  return {
    db: db(),
    queue: await queue(),
    correlationId: c.get('correlationId'),
    ip: forwarded || null,
    appUrl: env().APP_URL,
  }
}

/**
 * Context of a signed-in person. `user` is the business user, null until they enter the
 * product (create or join an organization). 401 without session.
 */
export async function accessCtx(
  c: Context<ApiEnv>,
): Promise<BaseCtx & { access: SessionAccess; user: User | null }> {
  const access = c.get('access')
  if (!access) throw new DomainError('UNAUTHENTICATED', 'Authentication required')
  const base = await baseCtx(c)
  return { ...base, access, user: await findUserByAuthId(base.db, access.authUserId) }
}
