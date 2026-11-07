import { z } from '@hono/zod-openapi'
import { captureError } from '@saas/adapters/errors'
import { DomainError, isDomainError } from '@saas/core'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ApiEnv } from './types.ts'

/** Normalized error format of the whole API. */
export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: 'NOT_FOUND' }),
      message: z.string(),
      details: z
        .array(
          z.object({
            path: z.string().optional(),
            code: z.string(),
            message: z.string().optional(),
          }),
        )
        .optional(),
      correlationId: z.string(),
    }),
  })
  .openapi('ErrorResponse')

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export function errorBody(c: Context<ApiEnv>, e: DomainError): ErrorResponse {
  return {
    error: {
      code: e.code,
      message: e.message,
      ...(e.details ? { details: e.details } : {}),
      correlationId: c.get('correlationId'),
    },
  }
}

/** The request logger, or stderr if the failure happened before it existed. */
const logOf = (c: Context<ApiEnv>) =>
  (c.get('log') as ApiEnv['Variables']['log'] | undefined) ?? {
    error: (fields: object, msg: string) => console.error(msg, fields),
  }

export function handleError(err: unknown, c: Context<ApiEnv>) {
  if (isDomainError(err)) {
    if (err.httpStatus >= 500) {
      logOf(c).error({ err }, 'domain error')
      captureError(err, { correlationId: c.get('correlationId'), tags: { code: err.code } })
    }
    return c.json(errorBody(c, err), err.httpStatus as ContentfulStatusCode)
  }
  // Unhandled: logged in detail, reported and answered without leaking internal information.
  logOf(c).error({ err }, 'unhandled error')
  captureError(err, {
    correlationId: c.get('correlationId'),
    tags: { method: c.req.method, route: c.req.routePath },
  })
  return c.json(errorBody(c, new DomainError('INTERNAL', 'Internal server error')), 500)
}

export function validationError(issues: z.core.$ZodIssue[]) {
  return new DomainError(
    'VALIDATION_FAILED',
    'Request validation failed',
    issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
  )
}
