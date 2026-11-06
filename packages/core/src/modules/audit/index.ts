import type { Prisma, TenantTx } from '@saas/database'

export interface AuditEntry {
  organizationId: string | null
  /** Business user (users.id). Null for system actions. */
  actorUserId: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  before?: Prisma.InputJsonValue
  after?: Prisma.InputJsonValue
  correlationId?: string | null
  ip?: string | null
}

/**
 * Writes an audit entry inside the caller's transaction, so the entry exists if and only
 * if the change it describes was committed. The table is append-only for app_user.
 */
export async function writeAudit(tx: TenantTx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      actorType: entry.actorUserId ? 'USER' : 'SYSTEM',
      actorId: entry.actorUserId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      ...(entry.before !== undefined ? { before: entry.before } : {}),
      ...(entry.after !== undefined ? { after: entry.after } : {}),
      correlationId: entry.correlationId ?? null,
      ip: entry.ip ?? null,
    },
  })
}
