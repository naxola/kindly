import {
  withTenant,
  type Procedure,
  type ProcedureVersionStatus,
  type TenantTx,
} from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'
import { ProcedureContent, ProcedureInput, type ProcedureContentInput } from './schemas.ts'

/**
 * Procedures ("trámites"): what the organization requires for a kind of request, versioned. Everyone
 * reads (a delegate needs the list of required documents); only administrators write. Only the
 * definition is stored, never a member's files.
 */

export interface ProcedureSummary {
  id: string
  name: string
  description: string | null
  /** Number of the CURRENT version, null if none. */
  currentVersion: number | null
}

export interface ProcedureVersionView {
  id: string
  version: number
  status: ProcedureVersionStatus
  createdAt: Date
  steps: { id: string; ordinal: number; title: string }[]
  requiredDocuments: { id: string; ordinal: number; name: string }[]
}

export interface ProcedureView extends Procedure {
  /** Newest first. */
  versions: ProcedureVersionView[]
}

/** Procedures of the organization, A-Z, with their current version number. */
export async function listProcedures(ctx: Ctx): Promise<ProcedureSummary[]> {
  authorize(ctx.actor, 'procedures.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const rows = await tx.procedure.findMany({
      where: { organizationId: ctx.actor.organizationId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: { versions: { where: { status: 'CURRENT' }, select: { version: true } } },
    })
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      currentVersion: p.versions[0]?.version ?? null,
    }))
  })
}

/** A procedure with every version (newest first), each with its steps and required documents. */
export async function getProcedure(ctx: Ctx, procedureId: string): Promise<ProcedureView> {
  authorize(ctx.actor, 'procedures.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const procedure = await tx.procedure.findFirst({
      where: { id: procedureId, organizationId: ctx.actor.organizationId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: {
            steps: {
              orderBy: { ordinal: 'asc' },
              select: { id: true, ordinal: true, title: true },
            },
            documents: {
              orderBy: { ordinal: 'asc' },
              select: { id: true, ordinal: true, name: true },
            },
          },
        },
      },
    })
    if (!procedure) throw new DomainError('NOT_FOUND', 'Procedure not found')
    const { versions, ...rest } = procedure
    return {
      ...rest,
      versions: versions.map(({ documents, organizationId: _o, procedureId: _p, ...v }) => ({
        ...v,
        requiredDocuments: documents,
      })),
    }
  })
}

/** Adds a version as CURRENT; the previous CURRENT becomes SUPERSEDED (the index allows one). */
async function insertVersion(
  tx: TenantTx,
  organizationId: string,
  procedureId: string,
  version: number,
  content: ReturnType<typeof ProcedureContent.parse>,
) {
  await tx.procedureVersion.updateMany({
    where: { procedureId, status: 'CURRENT' },
    data: { status: 'SUPERSEDED' },
  })
  const created = await tx.procedureVersion.create({
    data: { organizationId, procedureId, version, status: 'CURRENT' },
  })
  if (content.steps.length) {
    await tx.procedureStep.createMany({
      data: content.steps.map((title, i) => ({
        organizationId,
        procedureVersionId: created.id,
        ordinal: i + 1,
        title,
      })),
    })
  }
  if (content.requiredDocuments.length) {
    await tx.procedureRequiredDocument.createMany({
      data: content.requiredDocuments.map((name, i) => ({
        organizationId,
        procedureVersionId: created.id,
        ordinal: i + 1,
        name,
      })),
    })
  }
  return created
}

/** A new procedure with its first version (1, CURRENT). */
export async function createProcedure(ctx: Ctx, input: ProcedureInput): Promise<Procedure> {
  authorize(ctx.actor, 'procedures.write')
  const data = ProcedureInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const procedure = await tx.procedure.create({
      data: {
        organizationId: ctx.actor.organizationId,
        name: data.name,
        description: data.description ?? null,
      },
    })
    await insertVersion(tx, ctx.actor.organizationId, procedure.id, 1, data)
    await audit(ctx, tx, 'procedure.created', procedure.id, { version: 1 })
    return procedure
  })
}

/** Publishes the next version of a procedure of the organization (concurrent publishes are serialized). */
export async function publishProcedureVersion(
  ctx: Ctx,
  procedureId: string,
  input: ProcedureContentInput,
): Promise<{ id: string; version: number }> {
  authorize(ctx.actor, 'procedures.write')
  const content = ProcedureContent.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    // FOR UPDATE: two publishes at once must not compute the same version number.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM procedures WHERE id = ${procedureId}::uuid AND organization_id = ${ctx.actor.organizationId}::uuid
      FOR UPDATE`
    if (locked.length === 0) throw new DomainError('NOT_FOUND', 'Procedure not found')
    const latest = await tx.procedureVersion.aggregate({
      where: { procedureId },
      _max: { version: true },
    })
    const version = (latest._max.version ?? 0) + 1
    const created = await insertVersion(tx, ctx.actor.organizationId, procedureId, version, content)
    await tx.procedure.update({ where: { id: procedureId }, data: { updatedAt: new Date() } })
    await audit(ctx, tx, 'procedure.version_published', procedureId, { version })
    return { id: created.id, version }
  })
}

// Ids and the version number only.
const audit = (ctx: Ctx, tx: TenantTx, action: string, id: string, after: Record<string, number>) =>
  writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'procedure',
    resourceId: id,
    after,
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })
