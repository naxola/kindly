import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  ChangeRoleInput,
  changeMemberRole,
  disableMember,
  enableMember,
  listMembers,
} from '@saas/core'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json, Role } from './schemas.ts'

const MemberSchema = z
  .object({
    id: z.uuid(),
    userId: z.uuid(),
    displayName: z.string(),
    email: z.email().nullable(),
    role: Role,
    status: z.enum(['ACTIVE', 'DISABLED']),
    joinedAt: z.iso.datetime(),
  })
  .openapi('Member')

const list = createRoute({
  method: 'get',
  path: '/members',
  tags: ['members'],
  summary: 'Members of the active organization',
  security: cookieAuth,
  responses: {
    200: { description: 'Members', ...json(z.object({ items: z.array(MemberSchema) })) },
    ...errorResponses(401, 403),
  },
})

const changeRole = createRoute({
  method: 'put',
  path: '/members/{id}/role',
  tags: ['members'],
  summary: "Change a member's role (an active ADMIN always remains)",
  security: cookieAuth,
  request: { params: IdParam, body: { required: true, ...json(ChangeRoleInput) } },
  responses: { 204: { description: 'Changed' }, ...errorResponses(400, 401, 403, 404, 409) },
})

const setStatus = createRoute({
  method: 'put',
  path: '/members/{id}/status',
  tags: ['members'],
  summary: 'Disable or re-enable a member',
  security: cookieAuth,
  request: {
    params: IdParam,
    body: { required: true, ...json(z.object({ status: z.enum(['ACTIVE', 'DISABLED']) })) },
  },
  responses: { 204: { description: 'Changed' }, ...errorResponses(400, 401, 403, 404, 409) },
})

export const memberRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => {
    const items = await listMembers(await actorCtx(c))
    return c.json({ items: items.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })) }, 200)
  })
  .openapi(changeRole, async (c) => {
    await changeMemberRole(await actorCtx(c), c.req.valid('param').id, c.req.valid('json'))
    return c.body(null, 204)
  })
  .openapi(setStatus, async (c) => {
    const ctx = await actorCtx(c)
    const { id } = c.req.valid('param')
    if (c.req.valid('json').status === 'DISABLED') await disableMember(ctx, id)
    else await enableMember(ctx, id)
    return c.body(null, 204)
  })
