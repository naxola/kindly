import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  acceptInvitation,
  createInvitation,
  CreateInvitationInput,
  DomainError,
  ensureUser,
  getInvitationByToken,
  listPendingInvitations,
  revokeInvitation,
} from '@saas/core'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { rateLimit } from '../rate-limit.ts'
import { accessCtx, actorCtx, baseCtx, setActiveOrganization } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json, Role } from './schemas.ts'

const InvitationSchema = z
  .object({ id: z.uuid(), email: z.email(), role: Role, expiresAt: z.iso.datetime() })
  .openapi('Invitation')

const PreviewSchema = z
  .object({
    organizationName: z.string(),
    email: z.email(),
    role: Role,
    status: z.enum(['PENDING', 'EXPIRED', 'REVOKED', 'ACCEPTED']),
    expiresAt: z.iso.datetime(),
  })
  .openapi('InvitationPreview')

const Token = z.object({ token: z.string().min(20).max(200) })

const list = createRoute({
  method: 'get',
  path: '/invitations',
  tags: ['invitations'],
  summary: 'Pending invitations of the active organization',
  security: cookieAuth,
  responses: {
    200: { description: 'Pending', ...json(z.object({ items: z.array(InvitationSchema) })) },
    ...errorResponses(401, 403),
  },
})

const create = createRoute({
  method: 'post',
  path: '/invitations',
  tags: ['invitations'],
  summary: 'Invite someone by email (the worker sends the email)',
  security: cookieAuth,
  request: { body: { required: true, ...json(CreateInvitationInput) } },
  responses: {
    201: { description: 'Created', ...json(InvitationSchema) },
    ...errorResponses(400, 401, 403, 409),
  },
})

const revoke = createRoute({
  method: 'post',
  path: '/invitations/{id}/revoke',
  tags: ['invitations'],
  summary: 'Revoke a pending invitation',
  security: cookieAuth,
  request: { params: IdParam },
  responses: { 204: { description: 'Revoked' }, ...errorResponses(401, 403, 404) },
})

// The preview is public: limit guessing attempts per IP (tokens are 256-bit, this is hygiene).
const previewLimit = rateLimit({
  limit: 30,
  windowMs: 60_000,
  keys: (c) => [c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null],
})

const preview = createRoute({
  method: 'post',
  path: '/invitations/preview',
  tags: ['invitations'],
  summary: 'Public view of an invitation by its token (no session needed)',
  middleware: [previewLimit] as const,
  request: { body: { required: true, ...json(Token) } },
  responses: {
    200: { description: 'Invitation', ...json(PreviewSchema) },
    ...errorResponses(400, 404, 429),
  },
})

const accept = createRoute({
  method: 'post',
  path: '/invitations/accept',
  tags: ['invitations'],
  summary: 'Accept an invitation with the signed-in account (same email) and make it active',
  security: cookieAuth,
  request: { body: { required: true, ...json(Token) } },
  responses: {
    200: { description: 'Joined', ...json(z.object({ organizationId: z.uuid() })) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
})

const toJson = (i: { id: string; email: string; role: 'ADMIN' | 'MEMBER'; expiresAt: Date }) => ({
  id: i.id,
  email: i.email,
  role: i.role,
  expiresAt: i.expiresAt.toISOString(),
})

export const invitationRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => {
    const items = await listPendingInvitations(await actorCtx(c))
    return c.json({ items: items.map(toJson) }, 200)
  })
  .openapi(create, async (c) => {
    const { invitation } = await createInvitation(await actorCtx(c), c.req.valid('json'))
    return c.json(toJson(invitation), 201)
  })
  .openapi(revoke, async (c) => {
    await revokeInvitation(await actorCtx(c), c.req.valid('param').id)
    return c.body(null, 204)
  })
  .openapi(preview, async (c) => {
    const view = await getInvitationByToken(await baseCtx(c), c.req.valid('json').token)
    if (!view) throw new DomainError('NOT_FOUND', 'Invitation not found')
    return c.json(
      {
        organizationName: view.organizationName,
        email: view.email,
        role: view.role,
        status: view.status,
        expiresAt: view.expiresAt.toISOString(),
      },
      200,
    )
  })
  .openapi(accept, async (c) => {
    const ctx = await accessCtx(c)
    // Accepting an invitation is also a first entry into the product (ADR 0003).
    const user = ctx.user ?? (await ensureUser(ctx, ctx.access.authUserId))
    const member = await acceptInvitation(ctx, {
      token: c.req.valid('json').token,
      userId: user.id,
    })
    setActiveOrganization(c, member.organizationId)
    return c.json({ organizationId: member.organizationId }, 200)
  })
