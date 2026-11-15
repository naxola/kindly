import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { verifyAccountPassword } from '@saas/adapters/auth'
import {
  accountDeletionState,
  cancelAccountDeletion,
  DomainError,
  exportPersonalData,
  listMyOrganizations,
  previewAccountDeletion,
  requestAccountDeletion,
  updateProfile,
} from '@saas/core'
import { auth } from '../../auth.ts'
import { enforceRateLimit } from '../rate-limit.ts'
import { cookieAuth, errorResponses } from '../openapi.ts'
import { json } from './schemas.ts'
import { getCookie } from 'hono/cookie'
import { accessCtx, ACTIVE_ORG_COOKIE, userCtx } from '../session.ts'
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
    /** When the account will be deleted, if the person asked for it (ADR 0019). */
    deletionScheduledFor: z.iso.datetime().nullable(),
    /** The organization the API acts on: the chosen one, or the only one. */
    activeOrganizationId: z.uuid().nullable(),
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

const ProfileInput = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  /** `null` goes back to the organization's language. */
  locale: z.enum(['es', 'en']).nullable().optional(),
})

const patchMe = createRoute({
  method: 'patch',
  path: '/me',
  tags: ['identity'],
  summary: 'Change my display name and language',
  security: cookieAuth,
  request: { body: { required: true, ...json(ProfileInput) } },
  responses: {
    200: {
      description: 'Updated',
      ...json(
        z.object({
          id: z.uuid(),
          displayName: z.string(),
          locale: z.enum(['es', 'en']).nullable(),
        }),
      ),
    },
    ...errorResponses(400, 401, 403),
  },
})

const DeletionSchema = z
  .object({
    requestedAt: z.iso.datetime().nullable(),
    scheduledFor: z.iso.datetime().nullable(),
    /** What stops the deletion now: the person must fix each organization first. */
    blockers: z.array(
      z.object({
        code: z.enum(['LAST_ADMIN', 'ORGANIZATION_HAS_SUBSCRIPTION']),
        organizationId: z.uuid(),
        organizationName: z.string(),
      }),
    ),
    /** Organizations that will be archived because the person is their only member. */
    archive: z.array(z.object({ id: z.uuid(), name: z.string() })),
  })
  .openapi('AccountDeletion')

const getDeletion = createRoute({
  method: 'get',
  path: '/me/deletion',
  tags: ['identity'],
  summary: 'State of my account deletion and what would block or be archived',
  security: cookieAuth,
  responses: {
    200: { description: 'State', ...json(DeletionSchema) },
    ...errorResponses(401, 403),
  },
})

const requestDeletion = createRoute({
  method: 'post',
  path: '/me/deletion',
  tags: ['identity'],
  summary: 'Ask to delete my account (password required); it is executed after 14 days',
  security: cookieAuth,
  request: {
    body: { required: true, ...json(z.object({ password: z.string().min(1).max(256) })) },
  },
  responses: {
    200: { description: 'Scheduled', ...json(DeletionSchema) },
    ...errorResponses(400, 401, 403, 409, 429),
  },
})

const cancelDeletion = createRoute({
  method: 'delete',
  path: '/me/deletion',
  tags: ['identity'],
  summary: 'Cancel my pending account deletion',
  security: cookieAuth,
  responses: { 204: { description: 'Cancelled' }, ...errorResponses(401, 403) },
})

const exportData = createRoute({
  method: 'get',
  path: '/me/export',
  tags: ['identity'],
  summary: 'Download my personal data (JSON)',
  security: cookieAuth,
  responses: {
    200: {
      description: 'Personal data as a JSON attachment',
      content: { 'application/json': { schema: z.object({}).loose() } },
    },
    ...errorResponses(401, 403, 429),
  },
})

export const meRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(patchMe, async (c) => {
    const ctx = await userCtx(c)
    const updated = await updateProfile(ctx, ctx.user.id, c.req.valid('json'))
    return c.json(
      {
        id: updated.id,
        displayName: updated.displayName,
        locale: updated.locale === 'es' || updated.locale === 'en' ? updated.locale : null,
      },
      200,
    )
  })
  .openapi(getMe, async (c) => {
    const ctx = await accessCtx(c)
    const organizations = ctx.user ? await listMyOrganizations(ctx.db, ctx.user.id) : []
    const chosen = getCookie(c, ACTIVE_ORG_COOKIE)
    const activeOrganizationId = organizations.some((o) => o.id === chosen)
      ? chosen!
      : organizations.length === 1
        ? organizations[0]!.id
        : null
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
        deletionScheduledFor: ctx.user?.deletionScheduledFor?.toISOString() ?? null,
        activeOrganizationId,
        organizations,
      },
      200,
    )
  })
  .openapi(getDeletion, async (c) => {
    const ctx = await userCtx(c)
    const [state, plan] = await Promise.all([
      accountDeletionState(ctx.db, ctx.user.id),
      previewAccountDeletion(ctx.db, ctx.user.id),
    ])
    return c.json(
      {
        requestedAt: state?.requestedAt.toISOString() ?? null,
        scheduledFor: state?.scheduledFor.toISOString() ?? null,
        blockers: plan.blockers,
        archive: plan.archive,
      },
      200,
    )
  })
  .openapi(requestDeletion, async (c) => {
    const ctx = await userCtx(c)
    // Password guesses from a hijacked session are the risk: a tight limit per person.
    await enforceRateLimit(c, {
      scope: 'account-deletion',
      key: ctx.user.id,
      limit: 5,
      windowSeconds: 900,
    })
    const valid = await verifyAccountPassword(
      ctx.db,
      auth(),
      ctx.access.authUserId,
      c.req.valid('json').password,
    )
    if (!valid) {
      throw new DomainError('VALIDATION_FAILED', 'Wrong password', [
        { path: 'password', code: 'INVALID_PASSWORD' },
      ])
    }
    const result = await requestAccountDeletion(ctx, ctx.user.id)
    return c.json(
      {
        requestedAt: new Date().toISOString(),
        scheduledFor: result.scheduledFor.toISOString(),
        blockers: [],
        archive: result.archive,
      },
      200,
    )
  })
  .openapi(cancelDeletion, async (c) => {
    const ctx = await userCtx(c)
    await cancelAccountDeletion(ctx, ctx.user.id)
    return c.body(null, 204)
  })
  .openapi(exportData, async (c) => {
    const ctx = await userCtx(c)
    await enforceRateLimit(c, { scope: 'export', key: ctx.user.id, limit: 5, windowSeconds: 3600 })
    const data = await exportPersonalData(ctx, ctx.user.id)
    c.header('content-disposition', 'attachment; filename="personal-data.json"')
    c.header('cache-control', 'no-store')
    return c.json(JSON.parse(JSON.stringify(data)) as Record<string, unknown>, 200)
  })
