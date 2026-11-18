import { z } from '@hono/zod-openapi'
import { ErrorResponseSchema } from './errors.ts'

/** Common error responses to document the authenticated routes. */
export const errorResponses = (...codes: (400 | 401 | 403 | 404 | 409 | 429 | 503)[]) =>
  Object.fromEntries(
    codes.map((code) => [
      code,
      {
        description: {
          400: 'Validation failed',
          401: 'No session',
          403: 'Not allowed',
          404: 'Does not exist or is not visible',
          409: 'Conflict with the current state',
          429: 'Too many requests',
          503: 'A service this needs is not available',
        }[code],
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    ]),
  )

/** Authentication by Better Auth session cookie (ADR 0003). */
export const cookieAuth = [{ cookieAuth: [] }]

export const IdParam = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
})
