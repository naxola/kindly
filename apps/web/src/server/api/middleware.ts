import { randomUUID } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import { logger } from '../logger.ts'
import type { ApiEnv } from './types.ts'

const CORRELATION_HEADER = 'x-correlation-id'
const VALID_ID = /^[A-Za-z0-9._-]{8,128}$/

/** Propagates or creates the correlationId and logs each request. */
export const requestContext = createMiddleware<ApiEnv>(async (c, next) => {
  const incoming = c.req.header(CORRELATION_HEADER)
  const correlationId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID()
  // Set before anything that can fail (e.g. the logger reading the environment), so even
  // that failure gets a normalized answer with its correlationId.
  c.set('correlationId', correlationId)
  c.header(CORRELATION_HEADER, correlationId)
  const log = logger().child({ correlationId })
  c.set('log', log)
  const start = performance.now()
  await next()
  log.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - start),
    },
    'request',
  )
})
