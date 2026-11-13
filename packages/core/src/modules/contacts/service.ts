import { withTenant, type Contact, type TenantTx } from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { listActivitiesForEntity, recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'
import { displayNamesOf } from '../team/index.ts'
import { ContactInput } from './schemas.ts'
import { contactVisibilityWhere } from './visibility.ts'

/**
 * Every query runs in a tenant transaction (RLS) and also filters by what the actor may see
 * (`contactVisibilityWhere`): a contact that is not visible is indistinguishable from one that
 * does not exist.
 */

export interface ContactView extends Contact {
  /** Current reference delegate (null only for a contact that was never assigned). */
  referenceDelegate: { memberId: string; name: string; since: Date } | null
}

type WithOpenAssignment = Contact & {
  assignments: { delegateId: string; startedAt: Date }[]
}

const openAssignment = { where: { endedAt: null }, take: 1 } as const

async function withReference(tx: TenantTx, rows: WithOpenAssignment[]): Promise<ContactView[]> {
  const names = await displayNamesOf(
    tx,
    rows.flatMap((r) => r.assignments.map((a) => a.delegateId)),
  )
  return rows.map(({ assignments, ...contact }) => {
    const current = assignments[0]
    return {
      ...contact,
      referenceDelegate: current
        ? {
            memberId: current.delegateId,
            name: names.get(current.delegateId) ?? '',
            since: current.startedAt,
          }
        : null,
    }
  })
}

/** Contacts the actor may see, newest first. */
export async function listContacts(ctx: Ctx): Promise<ContactView[]> {
  authorize(ctx.actor, 'contacts.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const rows = await tx.contact.findMany({
      where: await contactVisibilityWhere(tx, ctx.actor),
      include: { assignments: openAssignment },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
    return withReference(tx, rows)
  })
}

export async function getContact(ctx: Ctx, contactId: string): Promise<ContactView> {
  authorize(ctx.actor, 'contacts.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const row = await tx.contact.findFirst({
      where: { id: contactId, ...(await contactVisibilityWhere(tx, ctx.actor)) },
      include: { assignments: openAssignment },
    })
    if (!row) throw new DomainError('NOT_FOUND', 'Contact not found')
    const [view] = await withReference(tx, [row])
    return view!
  })
}

/**
 * Whether the actor may see this contact, inside the caller's transaction. Other modules use it
 * before touching what hangs from a contact (affiliation, cases, tasks).
 */
export async function assertContactVisible(
  tx: TenantTx,
  actor: Ctx['actor'],
  contactId: string,
): Promise<Contact> {
  const contact = await tx.contact.findFirst({
    where: { id: contactId, ...(await contactVisibilityWhere(tx, actor)) },
  })
  if (!contact) throw new DomainError('NOT_FOUND', 'Contact not found')
  return contact
}

/**
 * A contact created by hand is assigned to its creator as the reference delegate, in the same
 * transaction: a contact is never observable without one. (No delegate picker in the form on
 * purpose: reassigning is a separate action for administrators.)
 */
export async function createContact(ctx: Ctx, input: ContactInput): Promise<ContactView> {
  authorize(ctx.actor, 'contacts.write')
  const data = ContactInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const created = await tx.contact.create({
      data: {
        organizationId: ctx.actor.organizationId,
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        notes: data.notes ?? null,
      },
    })
    await tx.contactAssignment.create({
      data: {
        organizationId: ctx.actor.organizationId,
        contactId: created.id,
        delegateId: ctx.actor.memberId,
        assignedById: ctx.actor.memberId,
      },
    })
    const contact = await tx.contact.findUniqueOrThrow({
      where: { id: created.id },
      include: { assignments: openAssignment },
    })
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'CONTACT_CREATED',
      actorMemberId: ctx.actor.memberId,
      entityType: 'contact',
      entityId: contact.id,
    })
    await audit(ctx, tx, 'contact.created', contact.id)
    const [view] = await withReference(tx, [contact])
    return view!
  })
}

/** Replaces the editable fields of a visible contact. */
export async function updateContact(
  ctx: Ctx,
  contactId: string,
  input: ContactInput,
): Promise<ContactView> {
  authorize(ctx.actor, 'contacts.write')
  const data = ContactInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertContactVisible(tx, ctx.actor, contactId)
    const contact = await tx.contact.update({
      where: { id: contactId },
      data: {
        name: data.name,
        phone: data.phone ?? null,
        email: data.email ?? null,
        notes: data.notes ?? null,
      },
      include: { assignments: openAssignment },
    })
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'CONTACT_UPDATED',
      actorMemberId: ctx.actor.memberId,
      entityType: 'contact',
      entityId: contactId,
    })
    await audit(ctx, tx, 'contact.updated', contactId)
    const [view] = await withReference(tx, [contact])
    return view!
  })
}

/**
 * Confirms who an auto-created contact is ("Contact → Unassigned", docs/PRODUCT.md §4): clears
 * `isUnassigned`. Edit its name, phone or email first if needed.
 */
export async function markContactIdentified(ctx: Ctx, contactId: string): Promise<ContactView> {
  authorize(ctx.actor, 'contacts.write')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const existing = await assertContactVisible(tx, ctx.actor, contactId)
    if (!existing.isUnassigned) {
      // Idempotent: confirming twice records nothing twice.
      const [view] = await withReference(tx, [
        await tx.contact.findUniqueOrThrow({
          where: { id: contactId },
          include: { assignments: openAssignment },
        }),
      ])
      return view!
    }
    const contact = await tx.contact.update({
      where: { id: contactId },
      data: { isUnassigned: false },
      include: { assignments: openAssignment },
    })
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'CONTACT_IDENTIFIED',
      actorMemberId: ctx.actor.memberId,
      entityType: 'contact',
      entityId: contactId,
    })
    await audit(ctx, tx, 'contact.identified', contactId)
    const [view] = await withReference(tx, [contact])
    return view!
  })
}

export interface ContactActivityView {
  id: string
  type: string
  actorId: string | null
  actorName: string | null
  metadata: unknown
  createdAt: Date
}

/** Timeline of a visible contact, newest first. */
export async function listContactActivity(
  ctx: Ctx,
  contactId: string,
): Promise<ContactActivityView[]> {
  authorize(ctx.actor, 'contacts.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertContactVisible(tx, ctx.actor, contactId)
    const rows = await listActivitiesForEntity(tx, 'contact', contactId)
    const names = await displayNamesOf(
      tx,
      rows.flatMap((r) => (r.actorId ? [r.actorId] : [])),
    )
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      actorId: r.actorId,
      actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
      metadata: r.metadata,
      createdAt: r.createdAt,
    }))
  })
}

function audit(ctx: Ctx, tx: TenantTx, action: string, contactId: string) {
  // Ids only: names, phones and emails are personal data and do not belong in the audit.
  return writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'contact',
    resourceId: contactId,
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })
}

/**
 * A contact created from the first message of an unknown sender ("a message from an unknown
 * contact is not lost", docs/PRODUCT.md §4). Flagged `isUnassigned` until someone confirms who it
 * is, and assigned to the delegate whose account received it, with no human actor. The name is
 * never invented: the provider's display name, else the phone, else the external id. No fuzzy
 * matching against existing contacts: duplicates are detected by hand (docs/DECISIONS.md).
 */
export async function createContactFromInbound(
  tx: TenantTx,
  input: {
    organizationId: string
    delegateMemberId: string
    name: string
    phone: string | null
  },
): Promise<Contact> {
  const contact = await tx.contact.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      phone: input.phone,
      isUnassigned: true,
    },
  })
  await tx.contactAssignment.create({
    data: {
      organizationId: input.organizationId,
      contactId: contact.id,
      delegateId: input.delegateMemberId,
      assignedById: null,
    },
  })
  return contact
}
