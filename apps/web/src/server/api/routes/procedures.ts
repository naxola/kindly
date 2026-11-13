import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  createProcedure,
  getProcedure,
  listProcedures,
  publishProcedureVersion,
  type ProcedureView,
} from '@saas/core'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * Procedures ("trámites"): the steps and required documents the organization defines, versioned.
 * Everyone reads; administrators write. Only the definition is stored, never a member's files.
 */

const VersionSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int(),
    status: z.enum(['CURRENT', 'SUPERSEDED']),
    createdAt: z.iso.datetime(),
    steps: z.array(z.object({ id: z.uuid(), ordinal: z.number().int(), title: z.string() })),
    requiredDocuments: z.array(
      z.object({ id: z.uuid(), ordinal: z.number().int(), name: z.string() }),
    ),
  })
  .openapi('ProcedureVersion')

const ProcedureSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    createdAt: z.iso.datetime(),
    /** Newest first. */
    versions: z.array(VersionSchema),
  })
  .openapi('Procedure')

const SummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    currentVersion: z.number().int().nullable(),
  })
  .openapi('ProcedureSummary')

const Content = z.object({
  steps: z
    .array(z.string().max(300))
    .max(100)
    .optional()
    .describe('In order; blanks and repeats are dropped'),
  requiredDocuments: z.array(z.string().max(300)).max(100).optional(),
})

const toProcedure = (p: ProcedureView) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  createdAt: p.createdAt.toISOString(),
  versions: p.versions.map((v) => ({
    id: v.id,
    version: v.version,
    status: v.status,
    createdAt: v.createdAt.toISOString(),
    steps: v.steps,
    requiredDocuments: v.requiredDocuments,
  })),
})

const list = createRoute({
  method: 'get',
  path: '/procedures',
  tags: ['procedures'],
  summary: 'Procedures of the organization, A-Z, with their current version',
  security: cookieAuth,
  responses: {
    200: { description: 'Procedures', ...json(z.object({ items: z.array(SummarySchema) })) },
    ...errorResponses(401, 403),
  },
})

const create = createRoute({
  method: 'post',
  path: '/procedures',
  tags: ['procedures'],
  summary: 'Create a procedure with its first version (administrators)',
  security: cookieAuth,
  request: {
    body: {
      required: true,
      ...json(
        Content.extend({
          name: z.string().min(1).max(200),
          description: z.string().max(2000).nullish(),
        }),
      ),
    },
  },
  responses: {
    201: { description: 'Created', ...json(z.object({ id: z.uuid() })) },
    ...errorResponses(400, 401, 403),
  },
})

const detail = createRoute({
  method: 'get',
  path: '/procedures/{id}',
  tags: ['procedures'],
  summary: 'A procedure with every version, newest first',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Procedure', ...json(ProcedureSchema) },
    ...errorResponses(401, 403, 404),
  },
})

const publish = createRoute({
  method: 'post',
  path: '/procedures/{id}/versions',
  tags: ['procedures'],
  summary: 'Publish the next version; the previous one is superseded (administrators)',
  security: cookieAuth,
  request: { params: IdParam, body: { required: true, ...json(Content) } },
  responses: {
    201: {
      description: 'Published',
      ...json(z.object({ id: z.uuid(), version: z.number().int() })),
    },
    ...errorResponses(400, 401, 403, 404),
  },
})

export const procedureRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => c.json({ items: await listProcedures(await actorCtx(c)) }, 200))
  .openapi(create, async (c) => {
    const p = await createProcedure(await actorCtx(c), c.req.valid('json'))
    return c.json({ id: p.id }, 201)
  })
  .openapi(detail, async (c) =>
    c.json(toProcedure(await getProcedure(await actorCtx(c), c.req.valid('param').id)), 200),
  )
  .openapi(publish, async (c) => {
    const v = await publishProcedureVersion(
      await actorCtx(c),
      c.req.valid('param').id,
      c.req.valid('json'),
    )
    return c.json(v, 201)
  })
