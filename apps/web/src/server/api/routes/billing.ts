import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getBillingOverview, listPlans } from '@saas/core'
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
