import createClient from 'openapi-fetch'
import type { paths } from '../generated/openapi'

/**
 * Typed API client (ADR 0007). Types are generated from the OpenAPI contract
 * (`pnpm api:generate`); a contract change breaks the typecheck.
 */
export const apiClient = createClient<paths>({ baseUrl: '' })

/** TanStack Query keys, centralized per module. */
export const queryKeys = {
  ops: {
    ready: ['ops', 'ready'] as const,
  },
}
