import 'server-only'
import { authEnv, baseEnv, databaseEnv, parseEnv } from '@saas/config/env'

const webEnv = baseEnv.extend(databaseEnv.shape).extend(authEnv.shape)

let cached: ReturnType<typeof parseEnv<typeof webEnv>> | undefined

/** Validated environment. Evaluated on first use (not during `next build`). */
export function env() {
  cached ??= parseEnv(webEnv)
  return cached
}
