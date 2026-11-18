import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  archiveOrganization,
  createOrganizationWithTeam,
  CreateOrganizationInput,
  ensureUser,
  leaveOrganization,
  resolveActor,
  updateOrganization,
} from '@saas/core'
import { deleteCookie } from 'hono/cookie'
import { cookieAuth, errorResponses } from '../openapi.ts'
import {
  accessCtx,
  ACTIVE_ORG_COOKIE,
  actorCtx,
  setActiveOrganization,
  userCtx,
} from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json, OrganizationSchema, Role } from './schemas.ts'

const CurrentSchema = z
  .object({
    organization: OrganizationSchema.extend({ defaultLocale: z.enum(['es', 'en']) }),
    member: z.object({ id: z.uuid(), role: Role, permissions: z.array(z.string()) }),
  })
  .openapi('CurrentOrganization')

const create = createRoute({
  method: 'post',
  path: '/organizations',
  tags: ['organization'],
  summary: 'Create an organization (its creator becomes ADMIN) and make it active',
  security: cookieAuth,
  request: { body: { required: true, ...json(CreateOrganizationInput) } },
  responses: {
    201: { description: 'Created', ...json(OrganizationSchema) },
    ...errorResponses(400, 401, 409),
  },
})

const switchActive = createRoute({
  method: 'put',
  path: '/me/organization',
  tags: ['organization'],
  summary: 'Change the active organization',
  security: cookieAuth,
  request: { body: { required: true, ...json(z.object({ organizationId: z.uuid() })) } },
  responses: { 204: { description: 'Changed' }, ...errorResponses(400, 401, 403, 404) },
})

const current = createRoute({
  method: 'get',
  path: '/organization',
  tags: ['organization'],
  summary: 'Active organization and the effective permissions in it',
  security: cookieAuth,
  responses: {
    200: { description: 'Active organization', ...json(CurrentSchema) },
    ...errorResponses(401, 403, 404),
  },
})

const update = createRoute({
  method: 'patch',
  path: '/organization',
  tags: ['organization'],
  summary: 'Rename the active organization or change its default language (ADMIN)',
  security: cookieAuth,
  request: {
    body: {
      required: true,
      ...json(
        z.object({
          name: z.string().trim().min(2).max(120).optional(),
          defaultLocale: z.enum(['es', 'en']).optional(),
        }),
      ),
    },
  },
  responses: {
    200: {
      description: 'Updated',
      ...json(OrganizationSchema.extend({ defaultLocale: z.enum(['es', 'en']) })),
    },
    ...errorResponses(400, 401, 403, 404),
  },
})

const archive = createRoute({
  method: 'post',
  path: '/organization/archive',
  tags: ['organization'],
  summary: 'Archive the active organization; its exact name must be typed (ADMIN)',
  security: cookieAuth,
  request: { body: { required: true, ...json(z.object({ confirmName: z.string() })) } },
  responses: { 204: { description: 'Archived' }, ...errorResponses(400, 401, 403, 404) },
})

const leave = createRoute({
  method: 'post',
  path: '/me/organization/leave',
  tags: ['organization'],
  summary: 'Leave the active organization (the last active ADMIN cannot)',
  security: cookieAuth,
  responses: { 204: { description: 'Left' }, ...errorResponses(401, 403, 404, 409) },
})

export const organizationRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(create, async (c) => {
    const ctx = await accessCtx(c)
    // First entry into the product: the business user is created here (ADR 0003).
    const user = ctx.user ?? (await ensureUser(ctx, ctx.access.authUserId))
    const { organization } = await createOrganizationWithTeam(ctx, user.id, c.req.valid('json'))
    setActiveOrganization(c, organization.id)
    return c.json({ id: organization.id, name: organization.name, slug: organization.slug }, 201)
  })
  .openapi(switchActive, async (c) => {
    const ctx = await userCtx(c)
    const { organizationId } = c.req.valid('json')
    await resolveActor(ctx.db, { userId: ctx.user.id, organizationId })
    setActiveOrganization(c, organizationId)
    return c.body(null, 204)
  })
  .openapi(current, async (c) => {
    const ctx = await actorCtx(c)
    const { organization } = await resolveActor(ctx.db, {
      userId: ctx.actor.userId,
      organizationId: ctx.actor.organizationId,
    })
    return c.json(
      {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          defaultLocale: organization.defaultLocale === 'en' ? ('en' as const) : ('es' as const),
        },
        member: {
          id: ctx.actor.memberId,
          role: ctx.actor.role,
          permissions: [...ctx.actor.permissions].sort(),
        },
      },
      200,
    )
  })
  .openapi(update, async (c) => {
    const organization = await updateOrganization(await actorCtx(c), c.req.valid('json'))
    return c.json(
      {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        defaultLocale: organization.defaultLocale === 'en' ? ('en' as const) : ('es' as const),
      },
      200,
    )
  })
  .openapi(archive, async (c) => {
    await archiveOrganization(await actorCtx(c), c.req.valid('json'))
    deleteCookie(c, ACTIVE_ORG_COOKIE, { path: '/' })
    return c.body(null, 204)
  })
  .openapi(leave, async (c) => {
    await leaveOrganization(await actorCtx(c))
    deleteCookie(c, ACTIVE_ORG_COOKIE, { path: '/' })
    return c.body(null, 204)
  })
