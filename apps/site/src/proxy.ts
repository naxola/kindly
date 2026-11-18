import { buildCsp, staticSecurityHeaders } from '@saas/config/security-headers'
import { NextResponse } from 'next/server'

/**
 * Security headers of the public site (R2.1). Pages are prerendered, so there is no per-request
 * nonce: the policy is static and allows Next's inline scripts, plus Plausible when configured.
 * Report-Only for now (see `apps/web/src/proxy.ts`).
 */
const CSP_HEADER = 'Content-Security-Policy-Report-Only'

export function proxy() {
  const plausible = process.env.PLAUSIBLE_DOMAIN ? ['https://plausible.io'] : []
  const csp = buildCsp({
    development: process.env.NODE_ENV === 'development',
    scriptSrc: plausible,
    connectSrc: plausible,
  })
  const response = NextResponse.next()
  response.headers.set(CSP_HEADER, csp)
  const https = (process.env.SITE_URL ?? '').startsWith('https://')
  for (const { key, value } of staticSecurityHeaders({ https })) response.headers.set(key, value)
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
