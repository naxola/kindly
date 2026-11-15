import type { Db, Prisma, TenantTx } from '@saas/database'

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
  // `createMany` (no RETURNING): rows without an organization can be inserted but not read back
  // under RLS, and `create` would read the row it just wrote.
  await tx.auditLog.createMany({
    data: [
      {
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
    ],
  })
}

/**
 * Retention (ADR 0018): deletes audit entries older than 24 months, in batches, through the
 * database function that owns that rule (the application cannot choose the cut-off). Returns how
 * many rows went; the purge itself is audited.
 */
export async function purgeExpiredAuditLogs(db: Db, maxBatches = 200): Promise<number> {
  let total = 0
  for (let i = 0; i < maxBatches; i++) {
    const rows = await db.$queryRaw<{ deleted: number }[]>`
      SELECT app.purge_expired_audit_logs() AS deleted`
    const deleted = rows[0]?.deleted ?? 0
    total += deleted
    if (deleted === 0) break
  }
  if (total > 0) {
    await db.$transaction((tx) =>
      writeAudit(tx, {
        organizationId: null,
        actorUserId: null,
        action: 'audit.purged',
        resourceType: 'audit_log',
        after: { deleted: total },
      }),
    )
  }
  return total
}
