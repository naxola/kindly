import { bearerMatches } from '@saas/adapters/metrics'
import { metricsEnv, parseEnv } from '@saas/config/env'
import { Hono } from 'hono'
import { metrics } from '../../metrics.ts'
import type { ApiEnv } from '../types.ts'

/**
 * Prometheus metrics (ADR 0008, amendment). This port reaches the Internet through the proxy, so
 * the endpoint needs the bearer token and, without `METRICS_TOKEN`, does not exist (404): metrics
 * are never open by accident. The proxy should not route `/api/metrics` outside either.
 */
export const metricsRoutes = new Hono<ApiEnv>().get('/metrics', async (c) => {
  const { METRICS_TOKEN: token } = parseEnv(metricsEnv)
  if (!token) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
  if (!bearerMatches(c.req.header('authorization'), token)) {
    return c.json({ error: { code: 'UNAUTHENTICATED' } }, 401)
  }
  return c.body(await metrics().registry.renderAsync(), 200, {
    'content-type': 'text/plain; version=0.0.4; charset=utf-8',
  })
})
