import { Prisma, withTenant, type MemberPosition, type TenantTx } from '@saas/database'
import { nowOf, type Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'
import { CreatePositionInput, UpdatePositionInput } from './schemas.ts'

/**
 * Positions (cargos) of an organization: a catalog of names with no behaviour (D15). Nothing
 * is ever deleted: a position in use is archived, so members and history keep their name.
 */

/** Position created with every organization, by the organization's language. */
export const DEFAULT_POSITIONS: Record<string, string[]> = {
  es: ['Delegado'],
  en: ['Delegate'],
}

/** Seeds the default positions inside the transaction that creates the organization. */
export async function seedDefaultPositions(
  tx: TenantTx,
  organizationId: string,
  locale: string,
): Promise<void> {
  const names = DEFAULT_POSITIONS[locale] ?? DEFAULT_POSITIONS.es!
  await tx.memberPosition.createMany({
    data: names.map((name, sortOrder) => ({ organizationId, name, sortOrder })),
  })
}

const taken = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

const nameTaken = () =>
  new DomainError('CONFLICT', 'There is already a position with that name', [
    { path: 'name', code: 'NAME_TAKEN' },
  ])

/** Positions of the active organization; archived ones only on request. */
export async function listPositions(
  ctx: Ctx,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<MemberPosition[]> {
  authorize(ctx.actor, 'members.read')
  return withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.memberPosition.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  )
}

export async function createPosition(ctx: Ctx, input: CreatePositionInput) {
  authorize(ctx.actor, 'positions.manage')
  const { name } = CreatePositionInput.parse(input)
  try {
    return await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
      const last = await tx.memberPosition.aggregate({ _max: { sortOrder: true } })
      const position = await tx.memberPosition.create({
        data: {
          organizationId: ctx.actor.organizationId,
          name,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      })
      await audit(ctx, tx, 'position.created', position.id, undefined, { name })
      return position
    })
  } catch (error) {
    if (taken(error)) throw nameTaken()
    throw error
  }
}

export async function updatePosition(ctx: Ctx, positionId: string, input: UpdatePositionInput) {
  authorize(ctx.actor, 'positions.manage')
  const data = UpdatePositionInput.parse(input)
  try {
    return await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
      const before = await tx.memberPosition.findUnique({ where: { id: positionId } })
      if (!before) throw new DomainError('NOT_FOUND', 'Position not found')
      const position = await tx.memberPosition.update({ where: { id: positionId }, data })
      await audit(
        ctx,
        tx,
        'position.updated',
        positionId,
        { name: before.name, sortOrder: before.sortOrder },
        { name: position.name, sortOrder: position.sortOrder },
      )
      return position
    })
  } catch (error) {
    if (taken(error)) throw nameTaken()
    throw error
  }
}

/** Archives a position (it stops being offered) or brings it back. Idempotent. */
export async function setPositionArchived(ctx: Ctx, positionId: string, archived: boolean) {
  authorize(ctx.actor, 'positions.manage')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const before = await tx.memberPosition.findUnique({ where: { id: positionId } })
    if (!before) throw new DomainError('NOT_FOUND', 'Position not found')
    if (!!before.archivedAt === archived) return before
    const position = await tx.memberPosition.update({
      where: { id: positionId },
      data: { archivedAt: archived ? nowOf(ctx) : null },
    })
    await audit(ctx, tx, archived ? 'position.archived' : 'position.restored', positionId)
    return position
  })
}

/**
 * The position must exist in the active organization and be offered (not archived). Inside the
 * caller's transaction, so the answer and the write that follows see the same state.
 */
export async function assertAssignablePosition(tx: TenantTx, positionId: string): Promise<void> {
  const position = await tx.memberPosition.findUnique({ where: { id: positionId } })
  if (!position || position.archivedAt) {
    throw new DomainError('VALIDATION_FAILED', 'Unknown or archived position', [
      { path: 'positionId', code: 'INVALID_POSITION' },
    ])
  }
}

function audit(
  ctx: Ctx,
  tx: TenantTx,
  action: string,
  resourceId: string,
  before?: Prisma.InputJsonValue,
  after?: Prisma.InputJsonValue,
) {
  return writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'member_position',
    resourceId,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })
}
