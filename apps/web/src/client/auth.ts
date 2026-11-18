/**
 * Calls to Better Auth (`/api/auth/*`) with plain fetch: these forms do not need its client
 * and the bundle does not load the library.
 */
export interface AuthResult<T = Record<string, unknown>> {
  ok: boolean
  status: number
  data: T | null
  /** Better Auth error code (e.g. INVALID_EMAIL_OR_PASSWORD). */
  code: string | null
}

export async function authRequest<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method: 'GET' | 'POST' = body === undefined ? 'GET' : 'POST',
): Promise<AuthResult<T>> {
  const res = await fetch(`/api/auth${path}`, {
    method,
    credentials: 'same-origin',
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  })
  const data = (await res.json().catch(() => null)) as (T & { code?: string }) | null
  return {
    ok: res.ok,
    status: res.status,
    data: res.ok ? data : null,
    code: res.ok ? null : (data?.code ?? (res.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN')),
  }
}

/** Password lengths (must match packages/adapters/src/auth). */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

/** Safe internal path to redirect to after sign-in (prevents open redirects). */
export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }
  return value
}

/** Better Auth error with its code, to show it translated. */
export class AuthError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'AuthError'
  }
}
