import { z } from 'zod'

/**
 * Environment schemas, one per concern. Each process (web, site, worker) validates
 * only the ones it needs at startup: if a variable is missing, it does not start.
 * Later phases add their own schemas here (auth, email, storage…).
 */

export const baseEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_URL: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

export const databaseEnv = z.object({
  /** Application connection (role app_user, subject to RLS). */
  DATABASE_URL: z.url(),
})

export type BaseEnv = z.infer<typeof baseEnv>
export type DatabaseEnv = z.infer<typeof databaseEnv>

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`)
    this.name = 'EnvError'
  }
}

/**
 * Validates environment variables against a schema. The error never includes the
 * values, only the variable names and the reason.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  const result = schema.safeParse(source)
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    )
  }
  return result.data
}
