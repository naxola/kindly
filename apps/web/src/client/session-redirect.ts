import { ApiError } from './errors.ts'

/** Screens that work without a session or without an organization: never redirected from. */
const PUBLIC_PATHS = [
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/invite',
]

const startsWithPath = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`)

/**
 * Where to send the person when an API call fails because their session ended
 * (`UNAUTHENTICATED`) or they have no active organization. Null: do nothing (any other error,
 * or already on a screen that handles it). The return address survives the sign-in.
 */
export function sessionRedirect(error: unknown, pathname: string, search = ''): string | null {
  if (!(error instanceof ApiError)) return null
  if (PUBLIC_PATHS.some((p) => startsWithPath(pathname, p))) return null
  if (error.reason === 'UNAUTHENTICATED') {
    return `/sign-in?next=${encodeURIComponent(pathname + search)}`
  }
  if (error.reason === 'NO_ACTIVE_ORGANIZATION' && !startsWithPath(pathname, '/onboarding')) {
    return '/onboarding'
  }
  return null
}
