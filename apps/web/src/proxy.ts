import {
  buildCsp,
  createNonce,
  paddleSources,
  staticSecurityHeaders,
  urlOrigin,
} from '@saas/config/security-headers'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Security headers and per-request CSP nonce (R2.1). Runs on every request at runtime, so the
 * image carries no environment (ADR 0006).
 *
 * The policy starts as Report-Only: violations show in the browser console but nothing is
 * blocked. Switch to `Content-Security-Policy` once the E2E journeys run clean against it.
 */
const CSP_HEADER = 'Content-Security-Policy-Report-Only'

function policy(nonce: string): string {
  const paddle =
    process.env.PAYMENT_PROVIDER === 'paddle'
      ? paddleSources(process.env.PADDLE_ENVIRONMENT === 'production' ? 'production' : 'sandbox')
      : null
  // The browser sends its errors to the DSN host (R4.6).
  const errors = urlOrigin(process.env.SENTRY_BROWSER_DSN)
  return buildCsp({
    nonce,
    development: process.env.NODE_ENV === 'development',
    scriptSrc: paddle?.script,
    styleSrc: paddle?.style,
    imgSrc: paddle?.img,
    connectSrc: [...(paddle?.connect ?? []), ...(errors ? [errors] : [])],
    frameSrc: paddle?.frame,
  })
}

export function proxy(request: NextRequest) {
  const nonce = createNonce()
  const csp = policy(nonce)

  // Next reads the nonce from the request's CSP header to tag its own inline scripts.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(CSP_HEADER, csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(CSP_HEADER, csp)
  const https = (process.env.APP_URL ?? '').startsWith('https://')
  for (const { key, value } of staticSecurityHeaders({ https })) response.headers.set(key, value)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
