import { withTenant } from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { authorize } from './authorization.ts'

/**
 * Activity of the organization: its audit log, newest first (ADR 0018). ADMIN only. What it shows
 * is who did what and when; never the IP, and never the `before`/`after` snapshots, which may
 * hold data the reader should not see.
 */
export const ListActivityInput = z.object({
  /** Opaque: the `nextCursor` of the previous page. */
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Exact action (`member.role_changed`) or a prefix ending in a dot (`member.`). */
  action: z.string().max(80).optional(),
  /** Business user (users.id) who did it. */
  actorUserId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
export type ListActivityInput = z.input<typeof ListActivityInput>

export interface ActivityEntry {
  id: string
  action: string
  resourceType: string
  resourceId: string | null
  /** Null for actions of the system (jobs, provider events). */
  actor: { userId: string; displayName: string } | null
  correlationId: string | null
  createdAt: Date
}

const encodeCursor = (createdAt: Date, id: string) =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url')

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|')
  const createdAt = new Date(iso ?? '')
  if (!id || Number.isNaN(createdAt.getTime()) || !z.uuid().safeParse(id).success) {
    throw new DomainError('VALIDATION_FAILED', 'Invalid cursor', [
      { path: 'cursor', code: 'INVALID_CURSOR' },
    ])
  }
  return { createdAt, id }
}

export async function listActivity(
  ctx: Ctx,
  input: ListActivityInput = {},
): Promise<{ items: ActivityEntry[]; nextCursor: string | null }> {
  authorize(ctx.actor, 'audit.read')
  const parsed = ListActivityInput.safeParse(input)
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'Invalid activity filters',
      parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        code: i.code,
        message: i.message,
      })),
    )
  }
  const { cursor, limit, action, actorUserId, from, to } = parsed.data
  const after = cursor ? decodeCursor(cursor) : null
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const rows = await tx.auditLog.findMany({
      where: {
        // Explicit filter besides RLS (ADR 0002).
        organizationId: ctx.actor.organizationId,
        ...(action ? { action: action.endsWith('.') ? { startsWith: action } : action } : {}),
        ...(actorUserId ? { actorId: actorUserId } : {}),
        ...(from || to
          ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
          : {}),
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })
    const page = rows.slice(0, limit)
    const actorIds = [...new Set(page.flatMap((r) => (r.actorId ? [r.actorId] : [])))].filter(
      (id) => z.uuid().safeParse(id).success,
    )
    const users = actorIds.length
      ? await tx.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true },
        })
      : []
    const names = new Map(users.map((u) => [u.id, u.displayName]))
    const last = page.at(-1)
    return {
      items: page.map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        actor:
          r.actorType === 'USER' && r.actorId
            ? { userId: r.actorId, displayName: names.get(r.actorId) ?? '' }
            : null,
        correlationId: r.correlationId,
        createdAt: r.createdAt,
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    }
  })
}
