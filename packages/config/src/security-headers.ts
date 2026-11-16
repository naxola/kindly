/**
 * Security headers shared by `web` and `site` (R2.1). Pure functions: each app reads its own
 * environment and passes the result in, so nothing here touches `process.env`.
 */

export interface Header {
  key: string
  value: string
}

/** Headers that do not depend on the request. HSTS only when the public URL is https. */
export function staticSecurityHeaders(options: { https: boolean }): Header[] {
  const headers: Header[] = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ]
  if (options.https) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' })
  }
  return headers
}

/** Hosts Paddle.js needs (script, checkout iframe, API); sandbox hosts only in sandbox. */
export function paddleSources(environment: 'sandbox' | 'production') {
  const sandbox = environment === 'sandbox'
  return {
    script: ['https://cdn.paddle.com'],
    frame: [sandbox ? 'https://sandbox-buy.paddle.com' : 'https://buy.paddle.com'],
    connect: [
      sandbox
        ? 'https://sandbox-checkout-service.paddle.com'
        : 'https://checkout-service.paddle.com',
    ],
    style: ['https://cdn.paddle.com'],
    img: ['https://*.paddle.com'],
  }
}

export interface CspOptions {
  /** Per-request nonce. Without it (static pages) inline scripts are allowed instead. */
  nonce?: string
  /** `next dev` needs `eval` for refresh and source maps. */
  development?: boolean
  scriptSrc?: string[]
  styleSrc?: string[]
  imgSrc?: string[]
  connectSrc?: string[]
  frameSrc?: string[]
}

/**
 * Content-Security-Policy. With a nonce, `strict-dynamic` lets the scripts Next loads (and
 * Paddle.js, injected by our own bundle) run without listing hosts. Styles keep
 * `'unsafe-inline'`: Tailwind, next-themes and Radix set inline styles, and style injection
 * is a far smaller risk than script injection.
 */
export function buildCsp(options: CspOptions = {}): string {
  const script = options.nonce
    ? [`'self'`, `'nonce-${options.nonce}'`, `'strict-dynamic'`]
    : [`'self'`, `'unsafe-inline'`]
  if (options.development) script.push(`'unsafe-eval'`)
  script.push(...(options.scriptSrc ?? []))

  const directives: Record<string, string[]> = {
    'default-src': [`'self'`],
    'script-src': script,
    'style-src': [`'self'`, `'unsafe-inline'`, ...(options.styleSrc ?? [])],
    'img-src': [`'self'`, 'data:', 'blob:', ...(options.imgSrc ?? [])],
    'font-src': [`'self'`, 'data:'],
    'connect-src': [`'self'`, ...(options.connectSrc ?? [])],
    'frame-src': options.frameSrc?.length ? options.frameSrc : [`'none'`],
    'object-src': [`'none'`],
    'base-uri': [`'self'`],
    'form-action': [`'self'`],
    'frame-ancestors': [`'none'`],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

/** Random nonce for one request (Web Crypto: works in the Next proxy runtime). */
export function createNonce(): string {
  return btoa(crypto.randomUUID())
}

/** Origin (`https://host:port`) of a URL such as a Sentry DSN, or null if there is none. */
export function urlOrigin(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}
