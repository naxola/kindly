// Public API of @saas/core. Domain modules (packages/core/src/modules/<name>/index.ts)
// are re-exported from here as they are added.
export { DomainError, isDomainError, ERROR_HTTP_STATUS } from './errors.ts'
export type { ErrorCode, ErrorDetail } from './errors.ts'
