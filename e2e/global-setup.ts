import { execFileSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import { installQueue } from '../scripts/install-queue.ts'

/** Migrated test database with the pg-boss tables. */
export default async function globalSetup() {
  loadEnv({ path: new URL('../.env', import.meta.url).pathname, quiet: true })
  execFileSync('pnpm', ['--filter', '@saas/database', 'exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_MIGRATOR_URL: process.env.TEST_DATABASE_MIGRATOR_URL },
  })
  await installQueue(process.env.TEST_DATABASE_URL!)
}
