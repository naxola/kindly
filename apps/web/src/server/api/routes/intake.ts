import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { clientKey } from '@saas/config/client-ip'
import {
  applyDuplicateAffiliateRequest,
  authenticateIntegrationKey,
  confirmAffiliateRequest,
  confirmAllAffiliateRequests,
  countOpenAffiliateRequests,
  createIntegrationKey,
  discardAffiliateRequest,
  listIntegrationKeys,
  listOpenAffiliateRequests,
  receiveAffiliateAlta,
  revokeIntegrationKey,
  type AffiliateRequestView,
  type IntegrationKeyView,
} from '@saas/core'
import { Hono } from 'hono'
import { db } from '../../db.ts'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { rateLimit } from '../rate-limit.ts'
import { actorCtx, requestIp } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * Altas of affiliates from an automation (n8n), docs/INTEGRATIONS.md §7.
 *
 * The public endpoint lives outside /v1 (no session, no CSRF): the integration key in
 * `Authorization: Bearer` is the authentication and decides the organization. Each item of the
 * payload is stored or reported on its own, so one bad alta never blocks the others. No personal
 * data is logged.
 */

export const MAX_INTAKE_BODY_BYTES = 512 * 1024
export const MAX_INTAKE_ITEMS = 50

// Per client IP: an automation sends a handful of requests a minute; this only stops abuse.
const intakeLimit = rateLimit({
  scope: 'affiliate-intake',
  limit: 60,
  windowMs: 60_000,
  keys: (c) => [clientKey(requestIp(c))],
})

export const intakeWebhookRoutes = new Hono<ApiEnv>().post(
  '/integrations/affiliate-requests',
  intakeLimit,
  async (c) => {
    const token = c.req.header('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    const key = token ? await authenticateIntegrationKey(db(), token) : null
    if (!key) return c.json({ error: 'Unauthorized' }, 401)

    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > MAX_INTAKE_BODY_BYTES) return c.json({ error: 'Payload too large' }, 413)
    const raw = await c.req.text()
    if (Buffer.byteLength(raw) > MAX_INTAKE_BODY_BYTES) {
      return c.json({ error: 'Payload too large' }, 413)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return c.json({ error: 'Body must be JSON' }, 400)
    }
    const items = Array.isArray(parsed) ? parsed : [parsed]
    if (items.length === 0) return c.json({ error: 'Empty payload' }, 400)
    if (items.length > MAX_INTAKE_ITEMS) {
      return c.json({ error: `At most ${MAX_INTAKE_ITEMS} items per request` }, 400)
    }
    const deps = { db: db(), correlationId: c.get('correlationId') }
    const results = []
    for (const [index, item] of items.entries()) {
      results.push({ index, ...(await receiveAffiliateAlta(deps, key.organizationId, item)) })
    }
    c.get('log').info(
      {
        items: items.length,
        received: results.filter((r) => r.status === 'RECEIVED').length,
        duplicate: results.filter((r) => r.status === 'DUPLICATE').length,
        invalid: results.filter((r) => r.status === 'INVALID').length,
      },
      'affiliate intake',
    )
    return c.json({ results }, 202)
  },
)

const AddressSchema = z.object({
  streetType: z.string().nullable(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  staircase: z.string().nullable(),
  floor: z.string().nullable(),
  door: z.string().nullable(),
  other: z.string().nullable(),
  country: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
})

const AltaDataSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    dni: z.string(),
    birthDate: z.string().nullable(),
    gender: z.string().nullable(),
    phoneE164: z.string().nullable(),
    email: z.string().nullable(),
    address: AddressSchema,
    province: z.string().nullable(),
    sector: z.string().nullable(),
    employmentStatus: z.string().nullable(),
    monthlyFeeCents: z.number().int().nullable(),
    workplace: z.string().nullable(),
    workplaceProvince: z.string().nullable(),
  })
  .openapi('AffiliateAltaData')

const RequestSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['PENDING', 'DUPLICATE', 'CONFIRMED', 'DISCARDED']),
    receivedAt: z.iso.datetime(),
    contactId: z.uuid().nullable(),
    duplicateOf: z.object({ contactId: z.uuid(), name: z.string() }).nullable(),
    proposedDelegate: z.object({ memberId: z.uuid(), name: z.string() }).nullable(),
    data: AltaDataSchema,
  })
  .openapi('AffiliateRequest')

const DelegateLoadSchema = z
  .object({
    memberId: z.uuid(),
    name: z.string(),
    assigned: z.number().int(),
    pending: z.number().int(),
  })
  .openapi('DelegateLoad')

const toRequest = (r: AffiliateRequestView) => ({
  id: r.id,
  status: r.status,
  receivedAt: r.receivedAt.toISOString(),
  contactId: r.contactId,
  duplicateOf: r.duplicateOf,
  proposedDelegate: r.proposedDelegate,
  data: r.data,
})

const KeySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    keyPrefix: z.string(),
    createdAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .openapi('IntegrationKey')

const toKey = (k: IntegrationKeyView) => ({
  id: k.id,
  name: k.name,
  keyPrefix: k.keyPrefix,
  createdAt: k.createdAt.toISOString(),
  lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
  revokedAt: k.revokedAt?.toISOString() ?? null,
})

const list = createRoute({
  method: 'get',
  path: '/affiliate-requests',
  tags: ['affiliate-requests'],
  summary: 'Altas waiting for a decision, with the delegates and their load (administrators)',
  security: cookieAuth,
  responses: {
    200: {
      description: 'Open altas',
      ...json(
        z.object({
          pending: z.array(RequestSchema),
          duplicates: z.array(RequestSchema),
          delegates: z.array(DelegateLoadSchema),
        }),
      ),
    },
    ...errorResponses(401, 403),
  },
})

const count = createRoute({
  method: 'get',
  path: '/affiliate-requests/count',
  tags: ['affiliate-requests'],
  summary: 'How many altas wait for a decision (administrators)',
  security: cookieAuth,
  responses: {
    200: { description: 'Count', ...json(z.object({ open: z.number().int() })) },
    ...errorResponses(401, 403),
  },
})

const confirm = createRoute({
  method: 'post',
  path: '/affiliate-requests/{id}/confirm',
  tags: ['affiliate-requests'],
  summary: 'Confirm a pending alta with its reference delegate',
  security: cookieAuth,
  request: {
    params: IdParam,
    body: {
      required: true,
      ...json(
        z.object({
          delegateId: z.uuid(),
          notifyContact: z.boolean().optional().describe('Also send the welcome email'),
        }),
      ),
    },
  },
  responses: {
    204: { description: 'Confirmed' },
    ...errorResponses(400, 401, 403, 404, 409),
  },
})

const confirmAll = createRoute({
  method: 'post',
  path: '/affiliate-requests/confirm-all',
  tags: ['affiliate-requests'],
  summary: 'Confirm every pending alta with its own proposal',
  security: cookieAuth,
  responses: {
    200: { description: 'Confirmed', ...json(z.object({ confirmed: z.number().int() })) },
    ...errorResponses(401, 403),
  },
})

const discard = createRoute({
  method: 'post',
  path: '/affiliate-requests/{id}/discard',
  tags: ['affiliate-requests'],
  summary: 'Discard an alta (a pending one also removes what it created, if nothing hangs from it)',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Discarded', ...json(z.object({ contactRemoved: z.boolean() })) },
    ...errorResponses(401, 403, 404, 409),
  },
})

const apply = createRoute({
  method: 'post',
  path: '/affiliate-requests/{id}/apply',
  tags: ['affiliate-requests'],
  summary: 'Update an existing affiliate with the data of a duplicate alta',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    204: { description: 'Applied' },
    ...errorResponses(401, 403, 404, 409),
  },
})

const listKeys = createRoute({
  method: 'get',
  path: '/integration-keys',
  tags: ['integrations'],
  summary: 'Integration keys of the organization (administrators)',
  security: cookieAuth,
  responses: {
    200: { description: 'Keys', ...json(z.object({ items: z.array(KeySchema) })) },
    ...errorResponses(401, 403),
  },
})

const createKey = createRoute({
  method: 'post',
  path: '/integration-keys',
  tags: ['integrations'],
  summary: 'Create a key; the token is returned only this once',
  security: cookieAuth,
  request: {
    body: { required: true, ...json(z.object({ name: z.string().min(1).max(80) })) },
  },
  responses: {
    201: { description: 'Created', ...json(z.object({ key: KeySchema, token: z.string() })) },
    ...errorResponses(400, 401, 403),
  },
})

const revokeKey = createRoute({
  method: 'post',
  path: '/integration-keys/{id}/revoke',
  tags: ['integrations'],
  summary: 'Revoke a key: from then on it answers 401',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Revoked', ...json(KeySchema) },
    ...errorResponses(401, 403, 404),
  },
})

export const intakeRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => {
    const open = await listOpenAffiliateRequests(await actorCtx(c))
    return c.json(
      {
        pending: open.pending.map(toRequest),
        duplicates: open.duplicates.map(toRequest),
        delegates: open.delegates,
      },
      200,
    )
  })
  .openapi(count, async (c) => {
    return c.json({ open: await countOpenAffiliateRequests(await actorCtx(c)) }, 200)
  })
  .openapi(confirmAll, async (c) => {
    return c.json(await confirmAllAffiliateRequests(await actorCtx(c)), 200)
  })
  .openapi(confirm, async (c) => {
    await confirmAffiliateRequest(await actorCtx(c), c.req.valid('param').id, c.req.valid('json'))
    return c.body(null, 204)
  })
  .openapi(discard, async (c) => {
    return c.json(await discardAffiliateRequest(await actorCtx(c), c.req.valid('param').id), 200)
  })
  .openapi(apply, async (c) => {
    await applyDuplicateAffiliateRequest(await actorCtx(c), c.req.valid('param').id)
    return c.body(null, 204)
  })
  .openapi(listKeys, async (c) => {
    const items = await listIntegrationKeys(await actorCtx(c))
    return c.json({ items: items.map(toKey) }, 200)
  })
  .openapi(createKey, async (c) => {
    const created = await createIntegrationKey(await actorCtx(c), c.req.valid('json'))
    return c.json({ key: toKey(created.key), token: created.token }, 201)
  })
  .openapi(revokeKey, async (c) => {
    return c.json(
      toKey(await revokeIntegrationKey(await actorCtx(c), c.req.valid('param').id)),
      200,
    )
  })
