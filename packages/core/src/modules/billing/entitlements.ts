import type { TenantTx } from '@saas/database'
import { nowOf, type Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { CATALOG, type Catalog } from './catalog.ts'
import { billingStateOf, type BillingState } from './state.ts'

/**
 * Entitlements (ADR 0012): what the ORGANIZATION may use, from its plan. Separate from
 * permissions, which say what a PERSON may do. A use case usually checks both:
 * `authorize(ctx.actor, …)` and then `requireFeature(ctx, tx, …)`.
 */
export function hasFeature(state: BillingState, feature: string, catalog: Catalog = CATALOG) {
  if (!catalog.features.includes(feature)) throw new Error(`Unknown feature '${feature}'`)
  return state.plan.features.includes(feature)
}

export async function requireFeature(
  ctx: Ctx,
  tx: TenantTx,
  feature: string,
  catalog: Catalog = CATALOG,
): Promise<void> {
  const state = await billingStateOf(tx, ctx.actor.organizationId, nowOf(ctx), catalog)
  if (!hasFeature(state, feature, catalog)) {
    throw new DomainError('FORBIDDEN', `Feature not in plan: ${feature}`, [
      { code: 'FEATURE_NOT_IN_PLAN', path: feature },
    ])
  }
}
