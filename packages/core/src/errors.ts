/**
 * Normalized domain errors. `code` is stable and part of the API contract: the UI
 * translates by code; `message` is diagnostic only (in English).
 */
export const ERROR_HTTP_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

export type ErrorCode = keyof typeof ERROR_HTTP_STATUS

export interface ErrorDetail {
  path?: string
  code: string
  message?: string
}

export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message)
    this.name = 'DomainError'
  }

  get httpStatus(): number {
    return ERROR_HTTP_STATUS[this.code]
  }
}

export const isDomainError = (e: unknown): e is DomainError => e instanceof DomainError
