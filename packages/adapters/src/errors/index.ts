import * as Sentry from '@sentry/node'

/**
 * Error tracking for Node processes (worker, scripts), Sentry protocol (Sentry or GlitchTip,
 * ADR 0008). Without DSN nothing is sent: errors stay in the logs only.
 * Privacy: since SDK 11 everything is collected by default, so `PRIVATE_DATA_COLLECTION`
 * turns every category off, and `scrubEvent` removes request data again before sending
 * (defence in depth).
 */
export interface ErrorContext {
  correlationId?: string | null
  organizationId?: string | null
  /** Business user id (users.id), never an email. */
  userId?: string | null
  tags?: Record<string, string>
}

/** Nothing personal or secret leaves the process. Shared with apps/web. */
export const PRIVATE_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
} satisfies Sentry.NodeOptions['dataCollection']

/**
 * The SDK keeps its client on a global carrier, so this is true in every bundle of the
 * process (Next builds instrumentation and routes as separate chunks).
 */
const enabled = () => Sentry.isInitialized()

/** Removes what may carry secrets or personal data. Exported for tests. */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.cookies
    delete event.request.headers
    delete event.request.data
    delete event.request.query_string
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {}
  return event
}

export function initErrorTracking({
  dsn,
  environment,
  service,
}: {
  dsn?: string
  environment: string
  service: string
}) {
  if (!dsn || enabled()) return
  Sentry.init({
    dsn,
    environment,
    serverName: service,
    dataCollection: PRIVATE_DATA_COLLECTION,
    // Values of variables and console/HTTP breadcrumbs may hold personal data. The
    // correlationId tag leads to the full story in the logs instead.
    includeLocalVariables: false,
    maxBreadcrumbs: 0,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
  })
}

export function captureError(error: unknown, context: ErrorContext = {}) {
  if (!enabled()) return
  Sentry.withScope((scope) => {
    if (context.correlationId) scope.setTag('correlationId', context.correlationId)
    if (context.organizationId) scope.setTag('organizationId', context.organizationId)
    if (context.userId) scope.setUser({ id: context.userId })
    for (const [k, v] of Object.entries(context.tags ?? {})) scope.setTag(k, v)
    Sentry.captureException(error)
  })
}

/** Sends what is pending before the process exits. */
export const flushErrors = (timeoutMs = 2000) =>
  enabled() ? Sentry.flush(timeoutMs) : Promise.resolve(true)
