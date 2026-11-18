import { Prisma, withTenant } from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'

export const SetSpendCapInput = z.object({
  /** Maximum overage per period in the plan currency; null removes the cap. */
  spendCap: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,2})?$/)
    .nullable(),
})
export type SetSpendCapInput = z.input<typeof SetSpendCapInput>

/** Sets or removes the spend cap of the organization's subscription (ADMIN). */
export async function setSpendCap(ctx: Ctx, input: SetSpendCapInput) {
  authorize(ctx.actor, 'billing.manage')
  const { spendCap } = SetSpendCapInput.parse(input)
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const sub = await tx.subscription.findUnique({
      where: { organizationId: ctx.actor.organizationId },
    })
    if (!sub || sub.status === 'CANCELED') {
      throw new DomainError('CONFLICT', 'The organization has no paid subscription', [
        { code: 'NO_SUBSCRIPTION' },
      ])
    }
    const updated = await tx.subscription.update({
      where: { id: sub.id },
      data: { spendCap: spendCap === null ? null : new Prisma.Decimal(spendCap) },
    })
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'billing.spend_cap_changed',
      resourceType: 'subscription',
      resourceId: sub.id,
      before: { spendCap: sub.spendCap?.toString() ?? null },
      after: { spendCap: updated.spendCap?.toString() ?? null },
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return { spendCap: updated.spendCap?.toString() ?? null }
  })
}

/** Closed periods of the organization, newest first, with their lines. */
export async function listBillingPeriods(ctx: Ctx, { limit = 12 }: { limit?: number } = {}) {
  authorize(ctx.actor, 'billing.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const periods = await tx.billingPeriod.findMany({
      orderBy: { periodStart: 'desc' },
      take: limit,
      include: { lines: { orderBy: { metric: 'asc' } } },
    })
    return periods.map((p) => ({
      id: p.id,
      plan: { key: p.planKey, version: p.planVersion },
      currency: p.currency,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      fixedPrice: p.fixedPrice.toString(),
      overageTotal: p.overageTotal.toString(),
      spendCap: p.spendCap?.toString() ?? null,
      amountDue: p.amountDue.toString(),
      status: p.status,
      closedAt: p.closedAt,
      lines: p.lines.map((l) => ({
        metric: l.metric,
        unit: l.unit,
        used: l.used.toString(),
        included: l.included?.toString() ?? null,
        overageUnits: l.overageUnits.toString(),
        unitPrice: l.unitPrice.toString(),
        amount: l.amount.toString(),
      })),
    }))
  })
}
