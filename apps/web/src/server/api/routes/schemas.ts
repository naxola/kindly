import { z } from '@hono/zod-openapi'

export const json = <T extends z.ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
})

export const Role = z.enum(['ADMIN', 'MEMBER'])

export const OrganizationSchema = z
  .object({ id: z.uuid(), name: z.string(), slug: z.string() })
  .openapi('Organization')
