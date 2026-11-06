import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { db } from '../../db.ts'
import { queue } from '../../queue.ts'
import type { ApiEnv } from '../types.ts'

const HealthSchema = z.object({ status: z.literal('ok') }).openapi('Health')
const CheckSchema = z.enum(['ok', 'fail'])
const ReadySchema = z
  .object({
    status: z.enum(['ok', 'fail']),
    checks: z.object({ database: CheckSchema, queue: CheckSchema }),
  })
  .openapi('Ready')

const health = createRoute({
  method: 'get',
  path: '/health',
  tags: ['ops'],
  summary: 'Liveness: the process answers',
  responses: {
    200: { description: 'Alive', content: { 'application/json': { schema: HealthSchema } } },
  },
})

const ready = createRoute({
  method: 'get',
  path: '/ready',
  tags: ['ops'],
  summary: 'Readiness: dependencies available',
  responses: {
    200: { description: 'Ready', content: { 'application/json': { schema: ReadySchema } } },
    503: {
      description: 'A dependency fails',
      content: { 'application/json': { schema: ReadySchema } },
    },
  },
})

async function check(fn: () => Promise<unknown>): Promise<'ok' | 'fail'> {
  try {
    await fn()
    return 'ok'
  } catch {
    return 'fail'
  }
}

export const healthRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(health, (c) => c.json({ status: 'ok' as const }, 200))
  .openapi(ready, async (c) => {
    const [database, jobQueue] = await Promise.all([
      check(() => db().$queryRaw`SELECT 1`),
      check(() => queue()),
    ])
    const checks = { database, queue: jobQueue }
    const ok = Object.values(checks).every((v) => v === 'ok')
    if (!ok) c.get('log').warn({ checks }, 'readiness check failed')
    return c.json({ status: ok ? ('ok' as const) : ('fail' as const), checks }, ok ? 200 : 503)
  })
