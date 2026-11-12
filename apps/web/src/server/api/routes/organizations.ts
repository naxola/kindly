import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  createOrganizationWithTeam,
  CreateOrganizationInput,
  ensureUser,
  resolveActor,
} from '@saas/core'
import { cookieAuth, errorResponses } from '../openapi.ts'
import { accessCtx, actorCtx, setActiveOrganization, userCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json, OrganizationSchema, Role } from './schemas.ts'

const CurrentSchema = z
  .object({
    organization: OrganizationSchema,
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
        organization: { id: organization.id, name: organization.name, slug: organization.slug },
        member: {
          id: ctx.actor.memberId,
          role: ctx.actor.role,
          permissions: [...ctx.actor.permissions].sort(),
        },
      },
      200,
    )
  })
