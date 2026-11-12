import { Prisma, withTenant, type ContactAssignment } from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'
import { displayNamesOf } from '../team/index.ts'
import { contactVisibilityWhere } from './visibility.ts'

/**
 * Who answers for a contact (docs/DECISIONS.md, "Asignación de afiliados" and "Delegado de
 * referencia"): one reference delegate at a time, with the history of the previous ones. Any
 * active member of the organization may be one (an administrator who creates a contact is its
 * first). Reassigning is for administrators.
 */

export interface AssignmentView {
  id: string
  contactId: string
  delegateId: string
  delegateName: string
  startedAt: Date
  endedAt: Date | null
  assignedById: string | null
}

const toView = (a: ContactAssignment, names: Map<string, string>): AssignmentView => ({
  id: a.id,
  contactId: a.contactId,
  delegateId: a.delegateId,
  delegateName: names.get(a.delegateId) ?? '',
  startedAt: a.startedAt,
  endedAt: a.endedAt,
  assignedById: a.assignedById,
})

/** Full history of a visible contact, current assignment first. */
export async function listAssignmentHistory(
  ctx: Ctx,
  contactId: string,
): Promise<AssignmentView[]> {
  authorize(ctx.actor, 'contacts.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const visible = await tx.contact.findFirst({
      where: { id: contactId, ...contactVisibilityWhere(ctx.actor) },
      select: { id: true },
    })
    if (!visible) throw new DomainError('NOT_FOUND', 'Contact not found')
    const rows = await tx.contactAssignment.findMany({
      where: { contactId },
      orderBy: [{ endedAt: { sort: 'asc', nulls: 'first' } }, { startedAt: 'desc' }],
    })
    const names = await displayNamesOf(
      tx,
      rows.map((r) => r.delegateId),
    )
    return rows.map((r) => toView(r, names))
  })
}

/**
 * Reassigns a contact to another reference delegate (administrators). Closes the open row and
 * opens a new one in one transaction, so there is never an instant with zero or two. Reassigning
 * to the current delegate changes nothing (no new row, no activity).
 */
export async function assignContactToDelegate(
  ctx: Ctx,
  contactId: string,
  delegateId: string,
): Promise<AssignmentView> {
  authorize(ctx.actor, 'contacts.assign')
  try {
    return await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
      const contact = await tx.contact.findUnique({
        where: { organizationId_id: { organizationId: ctx.actor.organizationId, id: contactId } },
        select: { id: true },
      })
      if (!contact) throw new DomainError('NOT_FOUND', 'Contact not found')
      const delegate = await tx.organizationMember.findFirst({
        where: { id: delegateId, status: 'ACTIVE' },
        select: { id: true },
      })
      if (!delegate) {
        throw new DomainError('VALIDATION_FAILED', 'The delegate is not an active member', [
          { path: 'delegateId', code: 'INVALID_DELEGATE' },
        ])
      }
      const current = await tx.contactAssignment.findFirst({
        where: { contactId, endedAt: null },
      })
      if (current?.delegateId === delegateId) {
        const names = await displayNamesOf(tx, [delegateId])
        return toView(current, names)
      }
      const now = ctx.now?.() ?? new Date()
      if (current) {
        await tx.contactAssignment.update({ where: { id: current.id }, data: { endedAt: now } })
      }
      const created = await tx.contactAssignment.create({
        data: {
          organizationId: ctx.actor.organizationId,
          contactId,
          delegateId,
          startedAt: now,
          assignedById: ctx.actor.memberId,
        },
      })
      await recordActivity(tx, {
        organizationId: ctx.actor.organizationId,
        type: 'CONTACT_DELEGATE_ASSIGNED',
        actorMemberId: ctx.actor.memberId,
        entityType: 'contact',
        entityId: contactId,
        metadata: { from: current?.delegateId ?? null, to: delegateId },
      })
      await writeAudit(tx, {
        organizationId: ctx.actor.organizationId,
        actorUserId: ctx.actor.userId,
        action: 'contact.delegate_assigned',
        resourceType: 'contact',
        resourceId: contactId,
        before: { delegateId: current?.delegateId ?? null },
        after: { delegateId },
        correlationId: ctx.correlationId,
        ip: ctx.ip,
      })
      const names = await displayNamesOf(tx, [delegateId])
      return toView(created, names)
    })
  } catch (error) {
    // Two administrators reassigning at once: the unique index lets only one win.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('CONFLICT', 'The contact was reassigned at the same time', [
        { code: 'CONCURRENT_ASSIGNMENT' },
      ])
    }
    throw error
  }
}
