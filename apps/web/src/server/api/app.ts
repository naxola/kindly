import { OpenAPIHono } from '@hono/zod-openapi'
import { DomainError } from '@saas/core'
import { auth } from '../auth.ts'
import { errorBody, handleError, validationError } from './errors.ts'
import { requestContext } from './middleware.ts'
import { sessionLimit } from './rate-limit.ts'
import { activityRoutes } from './routes/activity.ts'
import { billingRoutes } from './routes/billing.ts'
import { emailWebhookRoutes } from './routes/email-webhook.ts'
import { healthRoutes } from './routes/health.ts'
import { invitationRoutes } from './routes/invitations.ts'
import { memberRoutes } from './routes/members.ts'
import { meRoutes } from './routes/me.ts'
import { organizationRoutes } from './routes/organizations.ts'
import { paymentWebhookRoutes } from './routes/payments-webhook.ts'
import { csrfGuard, session } from './session.ts'
import type { ApiEnv } from './types.ts'

export const API_VERSION = 'v1'

function newApp() {
  return new OpenAPIHono<ApiEnv>({
    // Zod validation errors use the normalized format.
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(errorBody(c, validationError(result.error.issues)), 400)
      }
    },
  })
}

/** Versioned business API (/api/v1). Modules register their routes here. */
const v1 = newApp()
v1.use('*', csrfGuard, session, sessionLimit)
v1.route('/', meRoutes)
v1.route('/', organizationRoutes)
v1.route('/', memberRoutes)
v1.route('/', invitationRoutes)
v1.route('/', billingRoutes)
v1.route('/', activityRoutes)

export const api = newApp().basePath('/api')
api.use('*', requestContext)
api.route('/', healthRoutes)
api.route('/', paymentWebhookRoutes)
api.route('/', emailWebhookRoutes)
// Better Auth (ADR 0003): sign-up, sign-in, verification, recovery and sessions.
api.on(['GET', 'POST'], '/auth/*', (c) => auth().handler(c.req.raw))
api.route(`/${API_VERSION}`, v1)

api.onError(handleError)
api.notFound((c) => c.json(errorBody(c, new DomainError('NOT_FOUND', 'Route not found')), 404))

export const OPENAPI_DOCUMENT_CONFIG = {
  openapi: '3.1.0',
  info: {
    title: 'SaaS API',
    version: API_VERSION,
    description: 'REST API of the product. Contract generated from the Zod schemas.',
  },
} as const

api.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'better-auth.session_token',
  description: 'Better Auth session. Obtained with POST /api/auth/sign-in/email.',
})

api.doc31(`/${API_VERSION}/openapi.json`, OPENAPI_DOCUMENT_CONFIG)
