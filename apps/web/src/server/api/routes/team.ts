import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  createPosition,
  listPositions,
  setPositionArchived,
  updateMemberProfile,
  updateMyProfile,
  updatePosition,
} from '@saas/core'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * Positions (cargos) and the profile of each member (D14/D15). The bodies are declared here
 * in plain types for the contract; core validates and normalizes them again (blank = empty,
 * phone to E.164), so the API and the use cases cannot disagree.
 */

const PositionSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    sortOrder: z.number().int(),
    archived: z.boolean(),
  })
  .openapi('Position')

const toPosition = (p: {
  id: string
  name: string
  sortOrder: number
  archivedAt: Date | null
}) => ({
  id: p.id,
  name: p.name,
  sortOrder: p.sortOrder,
  archived: p.archivedAt !== null,
})

const PositionName = z.string().trim().min(1).max(60)

const MyProfileBody = z
  .object({
    firstName: z.string().min(1).max(80),
    lastName: z.string().max(120).nullish(),
    phone: z.string().max(40).nullish().describe('International format, e.g. +34600111222'),
    contactEmail: z.string().max(254).nullish(),
  })
  .openapi('MyProfileInput')

const MemberProfileBody = MyProfileBody.extend({
  positionId: z.uuid().nullish(),
  notes: z.string().max(2000).nullish(),
}).openapi('MemberProfileInput')

const listRoute = createRoute({
  method: 'get',
  path: '/positions',
  tags: ['team'],
  summary: 'Positions of the active organization (archived ones on request)',
  security: cookieAuth,
  request: { query: z.object({ includeArchived: z.enum(['true', 'false']).optional() }) },
  responses: {
    200: { description: 'Positions', ...json(z.object({ items: z.array(PositionSchema) })) },
    ...errorResponses(401, 403),
  },
})

const createRoute_ = createRoute({
  method: 'post',
  path: '/positions',
  tags: ['team'],
  summary: 'Create a position (ADMIN)',
  security: cookieAuth,
  request: { body: { required: true, ...json(z.object({ name: PositionName })) } },
  responses: {
    201: { description: 'Created', ...json(PositionSchema) },
    ...errorResponses(400, 401, 403, 409),
  },
})

const updateRoute = createRoute({
  method: 'put',
  path: '/positions/{id}',
  tags: ['team'],
  summary: 'Rename or reorder a position (ADMIN)',
  security: cookieAuth,
  request: {
    params: IdParam,
    body: {
      required: true,
      ...json(
        z.object({
          name: PositionName.optional(),
          sortOrder: z.number().int().min(0).max(10_000).optional(),
        }),
      ),
    },
  },
  responses: {
    200: { description: 'Updated', ...json(PositionSchema) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
})

const archiveRoute = createRoute({
  method: 'post',
  path: '/positions/{id}/archive',
  tags: ['team'],
  summary: 'Archive a position: it is no longer offered, people who have it keep it (ADMIN)',
  security: cookieAuth,
  request: { params: IdParam },
  responses: { 204: { description: 'Archived' }, ...errorResponses(401, 403, 404) },
})

const restoreRoute = createRoute({
  method: 'post',
  path: '/positions/{id}/restore',
  tags: ['team'],
  summary: 'Bring an archived position back (ADMIN)',
  security: cookieAuth,
  request: { params: IdParam },
  responses: { 204: { description: 'Restored' }, ...errorResponses(401, 403, 404) },
})

const memberProfile = createRoute({
  method: 'put',
  path: '/members/{id}/profile',
  tags: ['team'],
  summary: "Edit a member's profile, position and private notes (ADMIN)",
  security: cookieAuth,
  request: { params: IdParam, body: { required: true, ...json(MemberProfileBody) } },
  responses: { 204: { description: 'Saved' }, ...errorResponses(400, 401, 403, 404) },
})

const myProfile = createRoute({
  method: 'put',
  path: '/me/profile',
  tags: ['team'],
  summary: 'Edit my own name, phone and contact email in the active organization',
  security: cookieAuth,
  request: { body: { required: true, ...json(MyProfileBody) } },
  responses: { 204: { description: 'Saved' }, ...errorResponses(400, 401, 403) },
})

export const teamRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(listRoute, async (c) => {
    const items = await listPositions(await actorCtx(c), {
      includeArchived: c.req.valid('query').includeArchived === 'true',
    })
    return c.json({ items: items.map(toPosition) }, 200)
  })
  .openapi(createRoute_, async (c) => {
    return c.json(toPosition(await createPosition(await actorCtx(c), c.req.valid('json'))), 201)
  })
  .openapi(updateRoute, async (c) => {
    const position = await updatePosition(
      await actorCtx(c),
      c.req.valid('param').id,
      c.req.valid('json'),
    )
    return c.json(toPosition(position), 200)
  })
  .openapi(archiveRoute, async (c) => {
    await setPositionArchived(await actorCtx(c), c.req.valid('param').id, true)
    return c.body(null, 204)
  })
  .openapi(restoreRoute, async (c) => {
    await setPositionArchived(await actorCtx(c), c.req.valid('param').id, false)
    return c.body(null, 204)
  })
  .openapi(memberProfile, async (c) => {
    await updateMemberProfile(await actorCtx(c), c.req.valid('param').id, c.req.valid('json'))
    return c.body(null, 204)
  })
  .openapi(myProfile, async (c) => {
    await updateMyProfile(await actorCtx(c), c.req.valid('json'))
    return c.body(null, 204)
  })
