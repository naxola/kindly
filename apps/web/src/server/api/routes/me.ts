import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { listMyOrganizations } from '@saas/core'
import { cookieAuth, errorResponses } from '../openapi.ts'
import { accessCtx } from '../session.ts'
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

export const meRoutes = new OpenAPIHono<ApiEnv>().openapi(getMe, async (c) => {
  const ctx = await accessCtx(c)
  const organizations = ctx.user ? await listMyOrganizations(ctx.db, ctx.user.id) : []
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
      organizations,
    },
    200,
  )
})
