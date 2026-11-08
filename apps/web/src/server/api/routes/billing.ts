import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  getBillingOverview,
  listBillingPeriods,
  listPlans,
  SetSpendCapInput,
  setSpendCap,
} from '@saas/core'
import { cookieAuth, errorResponses } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/** Amounts and quantities are decimal strings: never floating point (ADR 0012). */
const DecimalString = z.string().openapi({ example: '29.00' })

const PlanSchema = z
  .object({
    key: z.string(),
    version: z.number().int(),
    interval: z.enum(['month', 'year']),
    currency: z.enum(['EUR', 'USD']),
    price: DecimalString,
    features: z.array(z.string()),
  })
  .openapi('Plan')

const BillingOverviewSchema = z
  .object({
    plan: PlanSchema,
    status: z.enum(['DEFAULT', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']),
    period: z.object({ start: z.iso.datetime(), end: z.iso.datetime() }),
    cancelAtPeriodEnd: z.boolean(),
    spendCap: DecimalString.nullable(),
    metrics: z.array(
      z.object({
        key: z.string(),
        unit: z.string(),
        used: DecimalString,
        included: DecimalString.nullable(),
        limit: z.enum(['hard', 'soft']),
        overagePrice: DecimalString.nullable(),
        percent: z.number().nullable(),
      }),
    ),
  })
  .openapi('BillingOverview')

const PlanOfferSchema = PlanSchema.extend({
  quotas: z.array(
    z.object({
      metric: z.string(),
      included: DecimalString.nullable(),
      limit: z.enum(['hard', 'soft']),
      overagePrice: DecimalString.nullable(),
    }),
  ),
}).openapi('PlanOffer')

const overview = createRoute({
  method: 'get',
  path: '/billing',
  tags: ['billing'],
  summary: 'Plan, current period and usage of the active organization',
  security: cookieAuth,
  responses: {
    200: { description: 'Overview', ...json(BillingOverviewSchema) },
    ...errorResponses(401, 403),
  },
})

const plans = createRoute({
  method: 'get',
  path: '/billing/plans',
  tags: ['billing'],
  summary: 'Plans available to new subscriptions',
  security: cookieAuth,
  responses: {
    200: { description: 'Plans', ...json(z.object({ items: z.array(PlanOfferSchema) })) },
    ...errorResponses(401),
  },
})

const BillingPeriodSchema = z
  .object({
    id: z.uuid(),
    plan: z.object({ key: z.string(), version: z.number().int() }),
    currency: z.string(),
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
    fixedPrice: DecimalString,
    overageTotal: DecimalString,
    spendCap: DecimalString.nullable(),
    amountDue: DecimalString,
    status: z.enum(['NO_CHARGE', 'PENDING_CHARGE', 'CHARGED', 'CHARGE_FAILED']),
    closedAt: z.iso.datetime(),
    lines: z.array(
      z.object({
        metric: z.string(),
        unit: z.string(),
        used: DecimalString,
        included: DecimalString.nullable(),
        overageUnits: DecimalString,
        unitPrice: DecimalString,
        amount: DecimalString,
      }),
    ),
  })
  .openapi('BillingPeriod')

const periods = createRoute({
  method: 'get',
  path: '/billing/periods',
  tags: ['billing'],
  summary: 'Closed billing periods of the active organization (newest first)',
  security: cookieAuth,
  responses: {
    200: { description: 'Periods', ...json(z.object({ items: z.array(BillingPeriodSchema) })) },
    ...errorResponses(401, 403),
  },
})

const spendCap = createRoute({
  method: 'put',
  path: '/billing/spend-cap',
  tags: ['billing'],
  summary: 'Set or remove the maximum overage per period',
  security: cookieAuth,
  request: { body: { required: true, ...json(SetSpendCapInput) } },
  responses: {
    200: { description: 'Updated', ...json(z.object({ spendCap: DecimalString.nullable() })) },
    ...errorResponses(400, 401, 403, 409),
  },
})

export const billingRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(overview, async (c) => {
    const o = await getBillingOverview(await actorCtx(c))
    return c.json(
      {
        ...o,
        period: { start: o.period.start.toISOString(), end: o.period.end.toISOString() },
      },
      200,
    )
  })
  .openapi(plans, async (c) => {
    await actorCtx(c)
    return c.json({ items: listPlans() }, 200)
  })
  .openapi(periods, async (c) => {
    const items = await listBillingPeriods(await actorCtx(c))
    return c.json(
      {
        items: items.map((p) => ({
          ...p,
          periodStart: p.periodStart.toISOString(),
          periodEnd: p.periodEnd.toISOString(),
          closedAt: p.closedAt.toISOString(),
        })),
      },
      200,
    )
  })
  .openapi(spendCap, async (c) => {
    return c.json(await setSpendCap(await actorCtx(c), c.req.valid('json')), 200)
  })
