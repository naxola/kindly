import { withTenant, type TenantTx } from '@saas/database'
import { z } from 'zod'
import { nowOf, type BaseCtx, type Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { emitEvent } from '../events/index.ts'
import { authorize } from '../identity/index.ts'
import { CATALOG, publicPlans, type Catalog } from './catalog.ts'
import type { PaymentProvider, ProviderEvent, ProviderSubscription } from './provider.ts'

function planForPrice(catalog: Catalog, priceId: string) {
  const plan = catalog.plans.find((p) => p.providerPriceId === priceId)
  if (!plan) throw new Error(`No catalog plan for provider price ${priceId}`)
  return plan
}

/**
 * Applies a verified provider event to the organization's subscription (job, ADR 0012).
 * Events arrive at least once and out of order: older ones than the last applied are skipped.
 */
export async function applyProviderEvent(
  ctx: BaseCtx,
  tx: TenantTx,
  organizationId: string,
  event: ProviderEvent,
  provider: string,
  catalog: Catalog = CATALOG,
) {
  if (event.kind !== 'subscription') return { applied: false as const }
  const s: ProviderSubscription = event.subscription
  if (s.organizationId !== organizationId) throw new Error('Event for another organization')
  const plan = planForPrice(catalog, s.priceId)
  const current = await tx.subscription.findUnique({ where: { organizationId } })
  if (current?.providerUpdatedAt && current.providerUpdatedAt >= event.occurredAt) {
    return { applied: false as const }
  }
  const now = nowOf(ctx)
  const pastDueSince =
    s.status === 'PAST_DUE' ? (current?.status === 'PAST_DUE' ? current.pastDueSince : now) : null
  const data = {
    planKey: plan.plan,
    planVersion: plan.version,
    status: s.status,
    // A canceled or paused subscription has no period at the provider: keep the last one.
    currentPeriodStart: s.periodStart ?? current?.currentPeriodStart ?? now,
    currentPeriodEnd: s.periodEnd ?? current?.currentPeriodEnd ?? now,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    provider,
    providerSubscriptionId: s.ref,
    providerCustomerId: s.customerRef,
    pastDueSince,
    providerUpdatedAt: event.occurredAt,
  }
  const saved = current
    ? await tx.subscription.update({ where: { id: current.id }, data })
    : await tx.subscription.create({ data: { organizationId, ...data } })
  await writeAudit(tx, {
    organizationId,
    actorUserId: null,
    action: 'billing.subscription_synced',
    resourceType: 'subscription',
    resourceId: saved.id,
    before: current
      ? { plan: `${current.planKey}@${current.planVersion}`, status: current.status }
      : undefined,
    after: { plan: `${plan.plan}@${plan.version}`, status: s.status, providerEventId: event.id },
    correlationId: ctx.correlationId,
  })
  if (!current || current.status !== s.status || current.planKey !== plan.plan) {
    await emitEvent(ctx, tx, {
      type: 'billing.subscription_changed',
      organizationId,
      subjectId: event.id,
      data: {
        organizationId,
        plan: `${plan.plan}@${plan.version}`,
        status: s.status,
        previousPlan: current ? `${current.planKey}@${current.planVersion}` : null,
        previousStatus: current?.status ?? null,
      },
    })
  }
  return { applied: true as const, subscription: saved }
}

export const StartCheckoutInput = z.object({ plan: z.string().min(1) })

/** Data to open the provider checkout for a public paid plan (ADMIN). */
export async function startCheckout(
  ctx: Ctx,
  provider: PaymentProvider | null,
  input: z.input<typeof StartCheckoutInput>,
  customerEmail: string | null,
  catalog: Catalog = CATALOG,
) {
  authorize(ctx.actor, 'billing.manage')
  if (!provider) {
    throw new DomainError('CONFLICT', 'No payment provider configured', [
      { code: 'PAYMENTS_DISABLED' },
    ])
  }
  const { plan: key } = StartCheckoutInput.parse(input)
  const plan = publicPlans(catalog).find((p) => p.plan === key)
  if (!plan?.providerPriceId) {
    throw new DomainError('NOT_FOUND', 'Plan not available', [{ code: 'PLAN_NOT_FOUND' }])
  }
  const live = await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.subscription.findUnique({ where: { organizationId: ctx.actor.organizationId } }),
  )
  if (live && live.status !== 'CANCELED') {
    // Changing an existing subscription goes through the provider portal, not a new checkout.
    throw new DomainError('CONFLICT', 'The organization already has a subscription', [
      { code: 'ALREADY_SUBSCRIBED' },
    ])
  }
  return provider.checkout({
    priceId: plan.providerPriceId,
    organizationId: ctx.actor.organizationId,
    customerEmail,
  })
}

/** Link to the provider's customer portal (payment method, invoices, cancel). ADMIN. */
export async function customerPortalUrl(ctx: Ctx, provider: PaymentProvider | null) {
  authorize(ctx.actor, 'billing.manage')
  const sub = await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.subscription.findUnique({ where: { organizationId: ctx.actor.organizationId } }),
  )
  if (!provider || !sub?.providerCustomerId || sub.provider !== provider.name) {
    throw new DomainError('CONFLICT', 'No subscription at the payment provider', [
      { code: 'NO_SUBSCRIPTION' },
    ])
  }
  return provider.portalUrl({
    customerRef: sub.providerCustomerId,
    subscriptionRef: sub.providerSubscriptionId,
  })
}
