/**
 * Errors of the browser to Sentry/GlitchTip (R4.6, ADR 0008 amended). Same privacy rules as the
 * server: no breadcrumbs, no form data, no cookies, no user, and no query string or fragment in any
 * URL (the invitation token travels in the fragment). The SDK is loaded only when a DSN is set.
 */
import type * as SentryBrowser from '@sentry/browser'
import type { ErrorEvent } from '@sentry/browser'

const stripUrl = (url: string) => url.split('#')[0]!.split('?')[0]!

/** Removes everything that may carry a secret or personal data. Exported for tests. */
export function scrubBrowserEvent<T extends Partial<ErrorEvent>>(event: T): T {
  if (event.request) {
    delete event.request.cookies
    delete event.request.headers
    delete event.request.data
    delete event.request.query_string
    if (event.request.url) event.request.url = stripUrl(event.request.url)
  }
  if (event.user) event.user = {}
  delete event.breadcrumbs
  delete event.extra
  for (const value of event.exception?.values ?? []) {
    for (const frame of value.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = stripUrl(frame.filename)
    }
  }
  return event
}

let sentry: typeof SentryBrowser | null = null

/** Starts the reporting once (no DSN: nothing is loaded and nothing is ever sent). */
export async function initBrowserErrors({
  dsn,
  environment,
}: {
  dsn: string
  environment: string
}) {
  if (sentry) return
  const loaded = await import('@sentry/browser')
  loaded.init({
    dsn,
    environment,
    // Every category of collected data off (the SDK collects everything by default since v11).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    maxBreadcrumbs: 0,
    tracesSampleRate: 0,
    // Only what reports errors: no breadcrumbs, no performance, no replay.
    integrations: (defaults) =>
      defaults.filter((i) => ['GlobalHandlers', 'Dedupe', 'FunctionToString'].includes(i.name)),
    beforeSend: (event) => scrubBrowserEvent(event),
  })
  sentry = loaded
}

/** Reports a handled error (an error boundary); does nothing while reporting is off. */
export function captureBrowserError(error: unknown, tags: Record<string, string> = {}) {
  sentry?.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) scope.setTag(key, value)
    sentry!.captureException(error)
  })
}
