import type { Prisma, TenantTx } from '@saas/database'

/**
 * Product timeline of an entity: what a person sees on a contact or a case ("created",
 * "reassigned to…"). It is NOT the security audit (`audit_logs`, who did what for compliance):
 * both can be written for the same action. Append-only.
 *
 * It has no authorization of its own: the module that owns the entity decides who may read it
 * (a contact's timeline is as visible as the contact). Each phase adds its types and entities.
 */
export type ActivityEntityType = 'contact'

export type ActivityType =
  | 'CONTACT_CREATED'
  | 'CONTACT_UPDATED'
  | 'CONTACT_IDENTIFIED'
  | 'CONTACT_DELEGATE_ASSIGNED'
  | 'AFFILIATION_CREATED'
  | 'AFFILIATION_UPDATED'
  | 'AFFILIATION_ENDED'

export interface ActivityEntry {
  organizationId: string
  type: ActivityType
  /** organization_members.id of the person; null for system activity with no human actor. */
  actorMemberId: string | null
  entityType: ActivityEntityType
  entityId: string
  metadata?: Prisma.InputJsonValue
}

/** Records an activity inside the caller's transaction (it exists iff the change does). */
export async function recordActivity(tx: TenantTx, entry: ActivityEntry): Promise<void> {
  await tx.activity.create({
    data: {
      organizationId: entry.organizationId,
      type: entry.type,
      actorId: entry.actorMemberId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
    },
  })
}

/** Newest first. The caller has already checked that the viewer may see the entity. */
export function listActivitiesForEntity(
  tx: TenantTx,
  entityType: ActivityEntityType,
  entityId: string,
  { limit = 100 }: { limit?: number } = {},
) {
  return tx.activity.findMany({
    where: { entityType, entityId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  })
}
