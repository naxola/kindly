import { newId, Prisma, withTenant } from '@saas/database'
import { z } from 'zod'
import { nowOf, type BaseCtx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { emitEvent } from '../events/index.ts'
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
