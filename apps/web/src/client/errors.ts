import { AuthError } from './auth.ts'

/** Normalized error of /api/v1. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: { code: string; path?: string }[] }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
  ) {
    super(body?.error.message ?? `HTTP ${status}`)
  }
  get code() {
    return this.body?.error.code ?? 'INTERNAL'
  }
  /** Specific code (e.g. LAST_ADMIN) or, if none, the general one (e.g. FORBIDDEN). */
  get reason() {
    return this.body?.error.details?.[0]?.code ?? this.code
  }
}

/** Unwraps an openapi-fetch result: returns `data` or throws ApiError. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.response.ok) return result.data as T
  throw new ApiError(result.response.status, (result.error as ApiErrorBody) ?? null)
}

type Translator = { (key: string): string; has: (key: string) => boolean }

/** Translated message of an API or auth error (`errors.*` in messages). */
export function errorText(t: Translator, error: unknown): string {
  const reason =
    error instanceof ApiError
      ? error.reason
      : error instanceof AuthError
        ? error.code
        : typeof error === 'string'
          ? error
          : null
  if (reason && t.has(`errors.${reason}`)) return t(`errors.${reason}`)
  if (error instanceof ApiError && t.has(`errors.${error.code}`)) return t(`errors.${error.code}`)
  return t('errors.UNKNOWN')
}
