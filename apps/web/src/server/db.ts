import 'server-only'
import { createDb, type Db } from '@saas/database'
import { env } from './env.ts'

// One instance per process (also across reloads in development).
const globalForDb = globalThis as unknown as { __db?: Db }

export function db(): Db {
  globalForDb.__db ??= createDb({ connectionString: env().DATABASE_URL })
  return globalForDb.__db
}
