import {
  DomainError,
  findUserByAuthId,
  listMyOrganizations,
  resolveActor,
  type BaseCtx,
  type Ctx,
} from '@saas/core'
import type { User } from '@saas/database'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
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

/**
 * Active organization: a business choice, so it lives in its own cookie and never in the
 * access session (ADR 0003). It is only a preference: every request re-checks the
 * membership with resolveActor.
 */
export const ACTIVE_ORG_COOKIE = 'active_org'

export function setActiveOrganization(c: Context<ApiEnv>, organizationId: string) {
  setCookie(c, ACTIVE_ORG_COOKIE, organizationId, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: env().APP_URL.startsWith('https://'),
    maxAge: 60 * 60 * 24 * 365,
  })
}

/** Business user of the request; 403 if they have not entered the product yet. */
export async function userCtx(c: Context<ApiEnv>) {
  const ctx = await accessCtx(c)
  if (!ctx.user) {
    throw new DomainError('FORBIDDEN', 'No organization yet', [{ code: 'NO_ACTIVE_ORGANIZATION' }])
  }
  return { ...ctx, user: ctx.user }
}

/**
 * Tenant context: the organization in the cookie (or the only one the person has) and an
 * active membership in it. Without membership, 404 so as not to reveal it exists.
 */
export async function actorCtx(c: Context<ApiEnv>): Promise<Ctx> {
  const ctx = await userCtx(c)
  let organizationId = getCookie(c, ACTIVE_ORG_COOKIE)
  if (!organizationId) {
    const mine = await listMyOrganizations(ctx.db, ctx.user.id)
    if (mine.length === 1) organizationId = mine[0]!.id
  }
  if (!organizationId) {
    throw new DomainError('FORBIDDEN', 'No active organization', [
      { code: 'NO_ACTIVE_ORGANIZATION' },
    ])
  }
  try {
    const { actor } = await resolveActor(ctx.db, { userId: ctx.user.id, organizationId })
    c.set('log', c.get('log').child({ organizationId }))
    return { ...ctx, actor }
  } catch (error) {
    // A stale cookie (left the organization, disabled…) must not stick.
    deleteCookie(c, ACTIVE_ORG_COOKIE, { path: '/' })
    throw error
  }
}
