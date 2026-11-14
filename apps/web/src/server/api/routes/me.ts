import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { listMyOrganizations, updateProfile } from '@saas/core'
import { cookieAuth, errorResponses } from '../openapi.ts'
import { json } from './schemas.ts'
import { getCookie } from 'hono/cookie'
import { accessCtx, ACTIVE_ORG_COOKIE, userCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'

const MeSchema = z
  .object({
    access: z.object({ email: z.email(), emailVerified: z.boolean() }),
    /** Null until the person enters the product (ADR 0003). */
    user: z
      .object({
        id: z.uuid(),
        displayName: z.string(),
        locale: z.enum(['es', 'en']).nullable(),
      })
      .nullable(),
    /** The organization the API acts on: the chosen one, or the only one. */
    activeOrganizationId: z.uuid().nullable(),
    organizations: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        slug: z.string(),
        role: z.enum(['ADMIN', 'MEMBER']),
      }),
    ),
  })
  .openapi('Me')

const getMe = createRoute({
  method: 'get',
  path: '/me',
  tags: ['identity'],
  summary: 'Current person and their organizations',
  security: cookieAuth,
  responses: {
    200: { description: 'Signed in', content: { 'application/json': { schema: MeSchema } } },
    ...errorResponses(401),
  },
})

const ProfileInput = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  /** `null` goes back to the organization's language. */
  locale: z.enum(['es', 'en']).nullable().optional(),
})

const patchMe = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['identity'],
  summary: 'Change my display name and language',
  security: cookieAuth,
  request: { body: { required: true, ...json(ProfileInput) } },
  responses: {
    200: {
      description: 'Updated',
      ...json(
        z.object({
          id: z.uuid(),
          displayName: z.string(),
          locale: z.enum(['es', 'en']).nullable(),
        }),
      ),
    },
    ...errorResponses(400, 401, 403),
  },
})

export const meRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(patchMe, async (c) => {
    const ctx = await userCtx(c)
    const updated = await updateProfile(ctx, ctx.user.id, c.req.valid('json'))
    return c.json(
      {
        id: updated.id,
        displayName: updated.displayName,
        locale: updated.locale === 'es' || updated.locale === 'en' ? updated.locale : null,
      },
      200,
    )
  })
  .openapi(getMe, async (c) => {
    const ctx = await accessCtx(c)
    const organizations = ctx.user ? await listMyOrganizations(ctx.db, ctx.user.id) : []
    const chosen = getCookie(c, ACTIVE_ORG_COOKIE)
    const activeOrganizationId = organizations.some((o) => o.id === chosen)
      ? chosen!
      : organizations.length === 1
        ? organizations[0]!.id
        : null
    return c.json(
      {
        access: { email: ctx.access.email, emailVerified: ctx.access.emailVerified },
        user: ctx.user
          ? {
              id: ctx.user.id,
              displayName: ctx.user.displayName,
              locale: ctx.user.locale === 'es' || ctx.user.locale === 'en' ? ctx.user.locale : null,
            }
          : null,
        activeOrganizationId,
        organizations,
      },
      200,
    )
  })
