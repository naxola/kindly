import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { listActivity } from '@saas/core'
import { cookieAuth, errorResponses } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

const ActivityEntrySchema = z
  .object({
    id: z.uuid(),
    action: z.string().openapi({ example: 'member.role_changed' }),
    resourceType: z.string(),
    resourceId: z.string().nullable(),
    /** Null for actions of the system. */
    actor: z.object({ userId: z.string(), displayName: z.string() }).nullable(),
    correlationId: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('ActivityEntry')

const Query = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  action: z.string().max(80).optional(),
  actorUserId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
})

const list = createRoute({
  method: 'get',
  path: '/audit-logs',
  tags: ['organization'],
  summary: 'Activity (audit log) of the active organization, newest first (ADMIN)',
  security: cookieAuth,
  request: { query: Query },
  responses: {
    200: {
      description: 'A page of entries',
      ...json(z.object({ items: z.array(ActivityEntrySchema), nextCursor: z.string().nullable() })),
    },
    ...errorResponses(400, 401, 403),
  },
})

export const activityRoutes = new OpenAPIHono<ApiEnv>().openapi(list, async (c) => {
  const q = c.req.valid('query')
  const { items, nextCursor } = await listActivity(await actorCtx(c), {
    ...(q.cursor ? { cursor: q.cursor } : {}),
    ...(q.limit ? { limit: q.limit } : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
    ...(q.from ? { from: new Date(q.from) } : {}),
    ...(q.to ? { to: new Date(q.to) } : {}),
  })
  return c.json(
    {
      items: items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
      nextCursor,
    },
    200,
  )
})
