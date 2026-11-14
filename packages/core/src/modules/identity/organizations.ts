import { newId, Prisma, withTenant } from '@saas/database'
import { z } from 'zod'
import { nowOf, type BaseCtx, type Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { emitEvent } from '../events/index.ts'
import { authorize } from './authorization.ts'
import { accessEmailOf } from './users.ts'

export const CreateOrganizationInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/),
  defaultLocale: z.enum(['es', 'en']).default('es'),
})
export type CreateOrganizationInput = z.input<typeof CreateOrganizationInput>

/**
 * Creates an organization and makes its creator the first ADMIN, in one transaction.
 * `userId` is the business user (users.id); call ensureUser first.
 */
export async function createOrganization(
  ctx: BaseCtx,
  userId: string,
  input: CreateOrganizationInput,
) {
  const data = CreateOrganizationInput.parse(input)
  const id = newId()
  try {
    return await withTenant(ctx.db, id, async (tx) => {
      const organization = await tx.organization.create({ data: { id, ...data } })
      const member = await tx.organizationMember.create({
        data: { organizationId: id, userId, role: 'ADMIN', joinedAt: nowOf(ctx) },
      })
      await writeAudit(tx, {
        organizationId: id,
        actorUserId: userId,
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: id,
        after: { name: data.name, slug: data.slug },
        correlationId: ctx.correlationId,
        ip: ctx.ip,
      })
      await emitEvent(ctx, tx, {
        type: 'organization.created',
        organizationId: id,
        subjectId: id,
        data: {
          organizationId: id,
          name: data.name,
          slug: data.slug,
          ownerUserId: userId,
          ownerEmail: await accessEmailOf(tx, userId),
        },
      })
      return { organization, member }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('CONFLICT', 'Slug already in use', [{ path: 'slug', code: 'TAKEN' }])
    }
    throw error
  }
}

export const UpdateOrganizationInput = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    defaultLocale: z.enum(['es', 'en']).optional(),
  })
  .refine((v) => v.name !== undefined || v.defaultLocale !== undefined, {
    message: 'Nothing to change',
  })
export type UpdateOrganizationInput = z.input<typeof UpdateOrganizationInput>

const invalid = (issues: z.core.$ZodIssue[]) =>
  new DomainError(
    'VALIDATION_FAILED',
    'Invalid organization data',
    issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
  )

/** Renames the organization or changes its default language. The slug never changes. */
export async function updateOrganization(ctx: Ctx, input: UpdateOrganizationInput) {
  authorize(ctx.actor, 'organization.update')
  const parsed = UpdateOrganizationInput.safeParse(input)
  if (!parsed.success) throw invalid(parsed.error.issues)
  const { name, defaultLocale } = parsed.data
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const before = await tx.organization.findUnique({ where: { id: ctx.actor.organizationId } })
    if (!before) throw new DomainError('NOT_FOUND', 'Organization not found')
    const updated = await tx.organization.update({
      where: { id: ctx.actor.organizationId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(defaultLocale !== undefined ? { defaultLocale } : {}),
      },
    })
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'organization.updated',
      resourceType: 'organization',
      resourceId: ctx.actor.organizationId,
      before: { name: before.name, defaultLocale: before.defaultLocale },
      after: { name: updated.name, defaultLocale: updated.defaultLocale },
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return updated
  })
}

export const ArchiveOrganizationInput = z.object({ confirmName: z.string() })

/**
 * Archives the organization: nobody can act in it any more and it leaves every list. The ADMIN
 * must type its exact name. Data is kept (nothing is deleted). It does NOT cancel a paid
 * subscription: that is cancelled from the billing screen first.
 */
export async function archiveOrganization(ctx: Ctx, input: { confirmName: string }) {
  authorize(ctx.actor, 'organization.update')
  const { confirmName } = ArchiveOrganizationInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const organization = await tx.organization.findUnique({
      where: { id: ctx.actor.organizationId },
    })
    if (!organization) throw new DomainError('NOT_FOUND', 'Organization not found')
    if (confirmName !== organization.name) {
      throw new DomainError('VALIDATION_FAILED', 'The name does not match', [
        { path: 'confirmName', code: 'NAME_MISMATCH' },
      ])
    }
    await tx.organization.update({
      where: { id: ctx.actor.organizationId },
      data: { archivedAt: nowOf(ctx) },
    })
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'organization.archived',
      resourceType: 'organization',
      resourceId: ctx.actor.organizationId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
  })
}
