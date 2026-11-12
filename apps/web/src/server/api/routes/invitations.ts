import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createInvitedAccount, PASSWORD_MAX_LENGTH } from '@saas/adapters/auth'
import {
  acceptInvitationWithProfile,
  DomainError,
  ensureUser,
  getInvitationByToken,
  inviteMember,
  listTeamInvitations,
  revokeInvitation,
} from '@saas/core'
import { auth } from '../../auth.ts'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { rateLimit } from '../rate-limit.ts'
import { accessCtx, actorCtx, baseCtx, setActiveOrganization } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json, Role } from './schemas.ts'

const InvitationSchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    role: Role,
    expiresAt: z.iso.datetime(),
    /** Name, phone and position the ADMIN chose; null for invitations sent without them. */
    profile: z
      .object({
        firstName: z.string(),
        lastName: z.string().nullable(),
        phone: z.string().nullable(),
        position: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      })
      .nullable(),
  })
  .openapi('Invitation')

const InviteBody = z
  .object({
    email: z.email(),
    role: Role.default('MEMBER'),
    firstName: z.string().min(1).max(80),
    lastName: z.string().max(120).nullish(),
    phone: z.string().max(40).nullish().describe('International format, e.g. +34600111222'),
    positionId: z.uuid().nullish(),
  })
  .openapi('InviteInput')

const PreviewSchema = z
  .object({
    organizationName: z.string(),
    email: z.email(),
    role: Role,
    status: z.enum(['PENDING', 'EXPIRED', 'REVOKED', 'ACCEPTED']),
    expiresAt: z.iso.datetime(),
    /** The invited email already has an account: offer sign-in, not sign-up. */
    emailRegistered: z.boolean(),
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
  request: { body: { required: true, ...json(InviteBody) } },
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

// Creating accounts from a public endpoint: stricter per-IP limit.
const registerLimit = rateLimit({
  limit: 5,
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

const RegisterInput = Token.extend({
  name: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})

const register = createRoute({
  method: 'post',
  path: '/invitations/register',
  tags: ['invitations'],
  summary:
    'Create the account of an invited email (already verified by the link), sign in and join',
  middleware: [registerLimit] as const,
  request: { body: { required: true, ...json(RegisterInput) } },
  responses: {
    201: { description: 'Joined', ...json(z.object({ organizationId: z.uuid() })) },
    ...errorResponses(400, 404, 409, 429),
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

type Profile = z.infer<typeof InvitationSchema>['profile']
const toJson = (i: {
  id: string
  email: string
  role: 'ADMIN' | 'MEMBER'
  expiresAt: Date
  profile: Profile
}) => ({
  id: i.id,
  email: i.email,
  role: i.role,
  expiresAt: i.expiresAt.toISOString(),
  profile: i.profile,
})

export const invitationRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => {
    const items = await listTeamInvitations(await actorCtx(c))
    return c.json({ items: items.map(toJson) }, 200)
  })
  .openapi(create, async (c) => {
    const ctx = await actorCtx(c)
    const input = c.req.valid('json')
    const { invitation } = await inviteMember(ctx, input)
    const [created] = (await listTeamInvitations(ctx)).filter((i) => i.id === invitation.id)
    return c.json(toJson(created ?? { ...invitation, profile: null }), 201)
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
        emailRegistered: view.emailRegistered,
      },
      200,
    )
  })
  .openapi(register, async (c) => {
    const { token, name, password } = c.req.valid('json')
    const ctx = await baseCtx(c)
    const view = await getInvitationByToken(ctx, token)
    if (!view) throw new DomainError('NOT_FOUND', 'Invitation not found')
    if (view.status !== 'PENDING') {
      throw new DomainError('CONFLICT', `Invitation is ${view.status.toLowerCase()}`, [
        { code: `INVITATION_${view.status}` },
      ])
    }
    const created = await createInvitedAccount(auth(), { email: view.email, name, password })
    if (!created.ok) {
      throw new DomainError(
        created.code === 'USER_ALREADY_EXISTS' ? 'CONFLICT' : 'VALIDATION_FAILED',
        'Cannot create the account',
        [
          {
            code: created.code,
            ...(created.code === 'USER_ALREADY_EXISTS' ? {} : { path: 'password' }),
          },
        ],
      )
    }
    // Signed in straight away: the session cookie goes back with this answer.
    const signIn = await auth().api.signInEmail({
      body: { email: view.email, password },
      returnHeaders: true,
    })
    for (const cookie of signIn.headers.getSetCookie())
      c.header('set-cookie', cookie, { append: true })
    const user = await ensureUser(ctx, created.authUserId)
    const member = await acceptInvitationWithProfile(ctx, { token, userId: user.id })
    setActiveOrganization(c, member.organizationId)
    return c.json({ organizationId: member.organizationId }, 201)
  })
  .openapi(accept, async (c) => {
    const ctx = await accessCtx(c)
    // Accepting an invitation is also a first entry into the product (ADR 0003).
    const user = ctx.user ?? (await ensureUser(ctx, ctx.access.authUserId))
    const member = await acceptInvitationWithProfile(ctx, {
      token: c.req.valid('json').token,
      userId: user.id,
    })
    setActiveOrganization(c, member.organizationId)
    return c.json({ organizationId: member.organizationId }, 200)
  })
