import { withTenant, type Affiliation, type TenantTx } from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { assertContactVisible } from '../contacts/index.ts'
import { authorize } from '../identity/index.ts'
import { isFeeOverdue } from './domain.ts'
import { AffiliationInput } from './schemas.ts'

/**
 * Affiliation of a contact (docs/ui/CONVERSATION_WORKSPACE.md §5.1): one row per continuous
 * period. Who may edit it: members with `affiliations.manage` who can SEE the contact (the same
 * visibility as the contact's page), so there is no separate "can edit" flag to keep in sync.
 */

export interface AffiliationView extends Affiliation {
  /** Fixed rule (see `isFeeOverdue`), computed on the server with the current date. */
  feeOverdue: boolean
}

const view = (a: Affiliation, now: Date): AffiliationView => ({
  ...a,
  feeOverdue: isFeeOverdue(a, now),
})

/**
 * The open period first, then the most recent closed ones. `createdAt` breaks the tie between a
 * leave and a rejoin on the same day (the form only collects a date, so two rows can share
 * `startedAt`).
 */
const ordering = [
  { endedAt: { sort: 'asc', nulls: 'first' } },
  { startedAt: 'desc' },
  { createdAt: 'desc' },
] as const

const nowOf = (ctx: Ctx) => ctx.now?.() ?? new Date()

/** Current period (open, or the last closed one); null before the first alta. */
export async function getCurrentAffiliation(
  ctx: Ctx,
  contactId: string,
): Promise<AffiliationView | null> {
  authorize(ctx.actor, 'contacts.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertContactVisible(tx, ctx.actor, contactId)
    const row = await tx.affiliation.findFirst({ where: { contactId }, orderBy: [...ordering] })
    return row ? view(row, nowOf(ctx)) : null
  })
}

/** Every period, current first: "affiliated from X to Y" for someone who left and came back. */
export async function listAffiliationHistory(
  ctx: Ctx,
  contactId: string,
): Promise<AffiliationView[]> {
  authorize(ctx.actor, 'contacts.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertContactVisible(tx, ctx.actor, contactId)
    const rows = await tx.affiliation.findMany({ where: { contactId }, orderBy: [...ordering] })
    return rows.map((r) => view(r, nowOf(ctx)))
  })
}

/** Alta, and also "rejoin" after a leave: only a second OPEN period is forbidden. */
export async function createAffiliation(
  ctx: Ctx,
  contactId: string,
  input: AffiliationInput,
): Promise<AffiliationView> {
  authorize(ctx.actor, 'affiliations.manage')
  const data = AffiliationInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertContactVisible(tx, ctx.actor, contactId)
    const open = await tx.affiliation.findFirst({ where: { contactId, endedAt: null } })
    if (open) {
      throw new DomainError('CONFLICT', 'The contact already has an active affiliation', [
        { code: 'ALREADY_AFFILIATED' },
      ])
    }
    const created = await tx.affiliation.create({
      data: {
        organizationId: ctx.actor.organizationId,
        contactId,
        memberNumber: data.memberNumber ?? null,
        status: 'ACTIVE',
        startedAt: data.startedAt ?? nowOf(ctx),
        feePaidUntil: data.feePaidUntil ?? null,
      },
    })
    await record(ctx, tx, 'AFFILIATION_CREATED', 'affiliation.created', contactId, created.id)
    return view(created, nowOf(ctx))
  })
}

/** Edits the open period in place: member number, start date, fee. */
export async function updateAffiliation(
  ctx: Ctx,
  contactId: string,
  input: AffiliationInput,
): Promise<AffiliationView> {
  authorize(ctx.actor, 'affiliations.manage')
  const data = AffiliationInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertContactVisible(tx, ctx.actor, contactId)
    const open = await tx.affiliation.findFirst({ where: { contactId, endedAt: null } })
    if (!open) throw noActiveAffiliation()
    const updated = await tx.affiliation.update({
      where: { id: open.id },
      data: {
        memberNumber: data.memberNumber ?? null,
        ...(data.startedAt ? { startedAt: data.startedAt } : {}),
        feePaidUntil: data.feePaidUntil ?? null,
      },
    })
    await record(ctx, tx, 'AFFILIATION_UPDATED', 'affiliation.updated', contactId, updated.id)
    return view(updated, nowOf(ctx))
  })
}

/** Leave ("dar de baja"): closes the open period and keeps it as history. */
export async function endAffiliation(ctx: Ctx, contactId: string): Promise<AffiliationView> {
  authorize(ctx.actor, 'affiliations.manage')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await assertContactVisible(tx, ctx.actor, contactId)
    const open = await tx.affiliation.findFirst({ where: { contactId, endedAt: null } })
    if (!open) throw noActiveAffiliation()
    const ended = await tx.affiliation.update({
      where: { id: open.id },
      data: { status: 'INACTIVE', endedAt: nowOf(ctx) },
    })
    await record(ctx, tx, 'AFFILIATION_ENDED', 'affiliation.ended', contactId, ended.id)
    return view(ended, nowOf(ctx))
  })
}

const noActiveAffiliation = () =>
  new DomainError('CONFLICT', 'The contact has no active affiliation', [
    { code: 'NO_ACTIVE_AFFILIATION' },
  ])

async function record(
  ctx: Ctx,
  tx: TenantTx,
  type: 'AFFILIATION_CREATED' | 'AFFILIATION_UPDATED' | 'AFFILIATION_ENDED',
  action: string,
  contactId: string,
  affiliationId: string,
) {
  // The affiliation has no page of its own: it shows on the contact's timeline.
  await recordActivity(tx, {
    organizationId: ctx.actor.organizationId,
    type,
    actorMemberId: ctx.actor.memberId,
    entityType: 'contact',
    entityId: contactId,
  })
  await writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'affiliation',
    resourceId: affiliationId,
    after: { contactId },
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })
}
