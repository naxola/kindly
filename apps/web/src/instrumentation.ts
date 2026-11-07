import type { Instrumentation } from 'next'

/**
 * Error tracking of the web server (ADR 0008). Runs once when the server starts.
 * Browser errors are not collected yet: see docs/operations.md.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { parseEnv, observabilityEnv, baseEnv } = await import('@saas/config/env')
  const { initErrorTracking } = await import('@saas/adapters/errors')
  const { SENTRY_DSN } = parseEnv(observabilityEnv)
  const { APP_ENV } = parseEnv(baseEnv.pick({ APP_ENV: true }))
  initErrorTracking({ dsn: SENTRY_DSN, environment: APP_ENV, service: 'web' })
}

/** Errors of pages and server components (the API reports its own in handleError). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (request.path.startsWith('/api/')) return
  const { captureError } = await import('@saas/adapters/errors')
  captureError(error, {
    tags: { routePath: context.routePath, routeType: context.routeType, method: request.method },
  })
}
