import {
  Prisma,
  withTenant,
  type AffiliateRequest,
  type AffiliateRequestStatus as Status,
  type Db,
  type TenantTx,
} from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { assignContactInTx } from '../contacts/index.ts'
import { authorize } from '../identity/index.ts'
import { displayNamesOf } from '../team/index.ts'
import { normalizeAffiliatePayload, type NormalizedAffiliate } from './normalize.ts'
import { proposeDelegate, type DelegateLoad } from './proposal.ts'

/**
 * Altas received from an automation and the administrator's decision on each (docs/DECISIONS.md,
 * "Altas de afiliados por webhook", ported 2026-11-16).
 *
 * Reception creates the contact, its affiliate profile and an ACTIVE affiliation right away, but
 * **no assignment**: until an administrator confirms the delegate, only someone who reads all
 * contacts sees it (contacts visibility). A DNI that already is an affiliate creates nothing: it
 * becomes a DUPLICATE request that the administrator applies or discards.
 */

export type IntakeItemResult =
  | { status: 'RECEIVED'; requestId: string; repeated: boolean }
  | { status: 'DUPLICATE'; requestId: string; repeated: boolean }
  | { status: 'INVALID'; errors: string[] }

const OPEN: Status[] = ['PENDING', 'DUPLICATE']

/**
 * Delegates (role MEMBER, active; never administrators) with their load, in the fixed tie-break
 * order: who joined first.
 */
async function delegateLoads(tx: TenantTx): Promise<DelegateLoad[]> {
  const members = await tx.organizationMember.findMany({
    where: { role: 'MEMBER', status: 'ACTIVE' },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  })
  const ids = members.map((m) => m.id)
  const [assigned, pending, names] = await Promise.all([
    tx.contactAssignment.groupBy({
      by: ['delegateId'],
      where: { endedAt: null, delegateId: { in: ids } },
      _count: { _all: true },
    }),
    tx.affiliateRequest.groupBy({
      by: ['proposedDelegateId'],
      where: { status: 'PENDING', proposedDelegateId: { in: ids } },
      _count: { _all: true },
    }),
    displayNamesOf(tx, ids),
  ])
  const assignedBy = new Map(assigned.map((r) => [r.delegateId, r._count._all]))
  const pendingBy = new Map(pending.map((r) => [r.proposedDelegateId, r._count._all]))
  return ids.map((id) => ({
    memberId: id,
    name: names.get(id) ?? '',
    assigned: assignedBy.get(id) ?? 0,
    pending: pendingBy.get(id) ?? 0,
  }))
}

const profileValues = (data: NormalizedAffiliate) => ({
  dni: data.dni,
  birthDate: data.birthDate ? new Date(`${data.birthDate}T00:00:00Z`) : null,
  gender: data.gender,
  streetType: data.address.streetType,
  street: data.address.street,
  streetNumber: data.address.number,
  staircase: data.address.staircase,
  floor: data.address.floor,
  door: data.address.door,
  addressOther: data.address.other,
  country: data.address.country,
  postalCode: data.address.postalCode,
  city: data.address.city,
  addressProvince: data.address.province,
  province: data.province,
  sector: data.sector,
  employmentStatus: data.employmentStatus,
  monthlyFeeCents: data.monthlyFeeCents,
  workplace: data.workplace,
  workplaceProvince: data.workplaceProvince,
})

const fullNameOf = (data: NormalizedAffiliate) => `${data.firstName} ${data.lastName}`

async function openRequestFor(
  db: Db,
  organizationId: string,
  dni: string,
): Promise<IntakeItemResult | null> {
  const open = await withTenant(db, organizationId, (tx) =>
    tx.affiliateRequest.findFirst({ where: { dni, status: { in: OPEN } } }),
  )
  if (!open) return null
  return {
    status: open.status === 'DUPLICATE' ? 'DUPLICATE' : 'RECEIVED',
    requestId: open.id,
    repeated: true,
  }
}

/**
 * Stores one alta of the payload in `organizationId` (deduced from the integration key). Never
 * throws for bad input: it comes back as INVALID with the reasons. Resending a DNI that is still
 * waiting answers with the same request (idempotent, also when two deliveries race).
 */
export async function receiveAffiliateAlta(
  deps: { db: Db; correlationId: string },
  organizationId: string,
  rawItem: unknown,
): Promise<IntakeItemResult> {
  const normalized = normalizeAffiliatePayload(rawItem)
  if (!normalized.ok) return { status: 'INVALID', errors: normalized.errors }
  const data = normalized.value
  const repeated = await openRequestFor(deps.db, organizationId, data.dni)
  if (repeated) return repeated

  try {
    return await withTenant(deps.db, organizationId, async (tx) => {
      const existing = await tx.affiliateProfile.findFirst({
        where: { dni: data.dni },
        select: { contactId: true },
      })
      if (existing) {
        const request = await tx.affiliateRequest.create({
          data: {
            organizationId,
            status: 'DUPLICATE',
            dni: data.dni,
            duplicateOfContactId: existing.contactId,
            data: data as unknown as Prisma.InputJsonValue,
          },
        })
        await recordActivity(tx, {
          organizationId,
          type: 'AFFILIATE_REQUEST_RECEIVED',
          actorMemberId: null,
          entityType: 'affiliate_request',
          entityId: request.id,
          metadata: { duplicateOfContactId: existing.contactId },
        })
        await audit(tx, organizationId, null, 'affiliate_request.received', request.id, deps)
        return { status: 'DUPLICATE' as const, requestId: request.id, repeated: false }
      }

      const proposedDelegateId = proposeDelegate(await delegateLoads(tx))
      const contact = await tx.contact.create({
        data: {
          organizationId,
          name: fullNameOf(data),
          phone: data.phoneE164,
          email: data.email,
        },
      })
      await tx.affiliateProfile.create({
        data: { organizationId, contactId: contact.id, ...profileValues(data) },
      })
      await tx.affiliation.create({
        data: { organizationId, contactId: contact.id, status: 'ACTIVE' },
      })
      const request = await tx.affiliateRequest.create({
        data: {
          organizationId,
          status: 'PENDING',
          dni: data.dni,
          contactId: contact.id,
          proposedDelegateId,
          data: data as unknown as Prisma.InputJsonValue,
        },
      })
      await recordActivity(tx, {
        organizationId,
        type: 'CONTACT_CREATED',
        actorMemberId: null,
        entityType: 'contact',
        entityId: contact.id,
        metadata: { source: 'affiliate_intake' },
      })
      await recordActivity(tx, {
        organizationId,
        type: 'AFFILIATE_REQUEST_RECEIVED',
        actorMemberId: null,
        entityType: 'affiliate_request',
        entityId: request.id,
        metadata: { contactId: contact.id, proposedDelegateId },
      })
      await audit(tx, organizationId, null, 'affiliate_request.received', request.id, deps)
      return { status: 'RECEIVED' as const, requestId: request.id, repeated: false }
    })
  } catch (error) {
    // Two deliveries of the same DNI racing: the loser answers with the winner's request.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await openRequestFor(deps.db, organizationId, data.dni)
      if (winner) return winner
    }
    throw error
  }
}

function audit(
  tx: TenantTx,
  organizationId: string,
  actorUserId: string | null,
  action: string,
  requestId: string,
  ctx: { correlationId: string; ip?: string | null },
) {
  return writeAudit(tx, {
    organizationId,
    actorUserId,
    action,
    resourceType: 'affiliate_request',
    resourceId: requestId,
    correlationId: ctx.correlationId,
    ip: ctx.ip ?? null,
  })
}

export interface AffiliateRequestView {
  id: string
  status: Status
  receivedAt: Date
  contactId: string | null
  duplicateOf: { contactId: string; name: string } | null
  proposedDelegate: { memberId: string; name: string } | null
  data: NormalizedAffiliate
}

export interface OpenAffiliateRequests {
  pending: AffiliateRequestView[]
  duplicates: AffiliateRequestView[]
  /** Delegates with their load, to choose who confirms each alta. */
  delegates: DelegateLoad[]
}

/** Altas waiting for a decision, oldest first, with the delegates and their load. */
export async function listOpenAffiliateRequests(ctx: Ctx): Promise<OpenAffiliateRequests> {
  authorize(ctx.actor, 'affiliate_requests.manage')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const rows = await tx.affiliateRequest.findMany({
      where: { status: { in: OPEN } },
      include: { duplicateOf: { select: { id: true, name: true } } },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    })
    const delegates = await delegateLoads(tx)
    const names = await displayNamesOf(
      tx,
      rows.flatMap((r) => (r.proposedDelegateId ? [r.proposedDelegateId] : [])),
    )
    const toView = (r: (typeof rows)[number]): AffiliateRequestView => ({
      id: r.id,
      status: r.status,
      receivedAt: r.receivedAt,
      contactId: r.contactId,
      duplicateOf: r.duplicateOf ? { contactId: r.duplicateOf.id, name: r.duplicateOf.name } : null,
      proposedDelegate: r.proposedDelegateId
        ? { memberId: r.proposedDelegateId, name: names.get(r.proposedDelegateId) ?? '' }
        : null,
      data: r.data as unknown as NormalizedAffiliate,
    })
    return {
      pending: rows.filter((r) => r.status === 'PENDING').map(toView),
      duplicates: rows.filter((r) => r.status === 'DUPLICATE').map(toView),
      delegates,
    }
  })
}

/** How many altas wait for a decision (the notice in the navigation). */
export async function countOpenAffiliateRequests(ctx: Ctx): Promise<number> {
  authorize(ctx.actor, 'affiliate_requests.manage')
  return withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.affiliateRequest.count({ where: { status: { in: OPEN } } }),
  )
}

const alreadyResolved = () =>
  new DomainError('CONFLICT', 'This alta was already resolved', [{ code: 'ALREADY_RESOLVED' }])

/**
 * Claims a request still in `from`, so a double click or two administrators resolve it once.
 * Returns the claimed row.
 */
async function claim(
  ctx: Ctx,
  tx: TenantTx,
  requestId: string,
  from: Status,
  to: Status,
  extra: Prisma.AffiliateRequestUncheckedUpdateManyInput = {},
): Promise<AffiliateRequest> {
  const { count } = await tx.affiliateRequest.updateMany({
    where: { id: requestId, status: from },
    data: {
      status: to,
      resolvedById: ctx.actor.memberId,
      resolvedAt: ctx.now?.() ?? new Date(),
      ...extra,
    },
  })
  if (count === 0) {
    const exists = await tx.affiliateRequest.findUnique({ where: { id: requestId } })
    if (!exists) throw new DomainError('NOT_FOUND', 'Alta not found')
    throw alreadyResolved()
  }
  return tx.affiliateRequest.findUniqueOrThrow({ where: { id: requestId } })
}

export const ConfirmAffiliateRequestInput = z.object({
  delegateId: z.uuid(),
  /** Also send the welcome email that introduces the delegate (needs the contact's email). */
  notifyContact: z.boolean().default(false),
})
export type ConfirmAffiliateRequestInput = z.input<typeof ConfirmAffiliateRequestInput>

/** Confirms a PENDING alta: its contact gets `delegateId` as reference delegate. */
export async function confirmAffiliateRequest(
  ctx: Ctx,
  requestId: string,
  input: ConfirmAffiliateRequestInput,
): Promise<void> {
  authorize(ctx.actor, 'affiliate_requests.manage')
  authorize(ctx.actor, 'contacts.assign')
  const { delegateId, notifyContact } = ConfirmAffiliateRequestInput.parse(input)
  await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const request = await claim(ctx, tx, requestId, 'PENDING', 'CONFIRMED')
    if (!request.contactId) throw alreadyResolved()
    // Validates the delegate (an active member of this organization) before it is recorded.
    await assignContactInTx(ctx, tx, request.contactId, delegateId, { notifyContact })
    await tx.affiliateRequest.update({
      where: { id: request.id },
      data: { finalDelegateId: delegateId },
    })
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'AFFILIATE_REQUEST_CONFIRMED',
      actorMemberId: ctx.actor.memberId,
      entityType: 'affiliate_request',
      entityId: request.id,
      metadata: {
        contactId: request.contactId,
        delegateId,
        proposedDelegateId: request.proposedDelegateId,
      },
    })
    await audit(
      tx,
      ctx.actor.organizationId,
      ctx.actor.userId,
      'affiliate_request.confirmed',
      request.id,
      ctx,
    )
  })
}

/** Confirms every PENDING alta that has a proposal, each with its own. Returns how many. */
export async function confirmAllAffiliateRequests(ctx: Ctx): Promise<{ confirmed: number }> {
  authorize(ctx.actor, 'affiliate_requests.manage')
  authorize(ctx.actor, 'contacts.assign')
  const pending = await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.affiliateRequest.findMany({
      where: { status: 'PENDING', proposedDelegateId: { not: null } },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, proposedDelegateId: true },
    }),
  )
  let confirmed = 0
  for (const r of pending) {
    try {
      await confirmAffiliateRequest(ctx, r.id, { delegateId: r.proposedDelegateId! })
      confirmed++
    } catch (error) {
      // Resolved meanwhile by someone else, or the proposed delegate is no longer active: skip it.
      if (!(error instanceof DomainError)) throw error
    }
  }
  return { confirmed }
}

/**
 * Discards an alta. A PENDING one also removes what its reception created (contact, profile,
 * affiliation) while nothing else hangs from the contact (conversations, tasks); otherwise the
 * contact stays and only the request is closed. A DUPLICATE changes nothing.
 */
export async function discardAffiliateRequest(
  ctx: Ctx,
  requestId: string,
): Promise<{ contactRemoved: boolean }> {
  authorize(ctx.actor, 'affiliate_requests.manage')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const open = await tx.affiliateRequest.findUnique({ where: { id: requestId } })
    if (!open) throw new DomainError('NOT_FOUND', 'Alta not found')
    if (open.status !== 'PENDING' && open.status !== 'DUPLICATE') throw alreadyResolved()
    let removable = false
    if (open.status === 'PENDING' && open.contactId) {
      const [conversations, tasks, assignments] = await Promise.all([
        tx.conversation.count({ where: { contactId: open.contactId } }),
        tx.task.count({ where: { contactId: open.contactId } }),
        tx.contactAssignment.count({ where: { contactId: open.contactId } }),
      ])
      removable = conversations + tasks + assignments === 0
    }
    // The request stops pointing at the contact before the contact goes (the reference is RESTRICT).
    await claim(ctx, tx, requestId, open.status, 'DISCARDED', removable ? { contactId: null } : {})
    if (removable && open.contactId) {
      await tx.affiliateProfile.deleteMany({ where: { contactId: open.contactId } })
      await tx.affiliation.deleteMany({ where: { contactId: open.contactId } })
      await tx.contact.delete({ where: { id: open.contactId } })
    }
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'AFFILIATE_REQUEST_DISCARDED',
      actorMemberId: ctx.actor.memberId,
      entityType: 'affiliate_request',
      entityId: requestId,
      metadata: { wasDuplicate: open.status === 'DUPLICATE', contactRemoved: removable },
    })
    await audit(
      tx,
      ctx.actor.organizationId,
      ctx.actor.userId,
      'affiliate_request.discarded',
      requestId,
      ctx,
    )
    return { contactRemoved: removable }
  })
}

/**
 * For a DUPLICATE: overwrites the existing affiliate's data (name, phone, email and profile) with
 * what the new alta carries. The reference delegate does not change.
 */
export async function applyDuplicateAffiliateRequest(ctx: Ctx, requestId: string): Promise<void> {
  authorize(ctx.actor, 'affiliate_requests.manage')
  await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const request = await claim(ctx, tx, requestId, 'DUPLICATE', 'CONFIRMED')
    const contactId = request.duplicateOfContactId
    if (!contactId) throw alreadyResolved()
    const data = request.data as unknown as NormalizedAffiliate
    await tx.contact.update({
      where: { id: contactId },
      data: {
        name: fullNameOf(data),
        ...(data.phoneE164 ? { phone: data.phoneE164 } : {}),
        ...(data.email ? { email: data.email } : {}),
      },
    })
    await tx.affiliateProfile.update({
      where: { organizationId_contactId: { organizationId: ctx.actor.organizationId, contactId } },
      data: profileValues(data),
    })
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'AFFILIATE_REQUEST_APPLIED',
      actorMemberId: ctx.actor.memberId,
      entityType: 'affiliate_request',
      entityId: requestId,
      metadata: { contactId },
    })
    await audit(
      tx,
      ctx.actor.organizationId,
      ctx.actor.userId,
      'affiliate_request.applied',
      requestId,
      ctx,
    )
  })
}
