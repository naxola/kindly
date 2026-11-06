import { execFileSync } from 'node:child_process'
import { config as loadEnv } from 'dotenv'
import { createBoss } from '@saas/adapters/queue'

/** Migrated test database with the pg-boss tables (the worker creates them; here, this setup). */
export default async function globalSetup() {
  loadEnv({ path: new URL('../.env', import.meta.url).pathname, quiet: true })
  execFileSync('pnpm', ['--filter', '@saas/database', 'exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_MIGRATOR_URL: process.env.TEST_DATABASE_MIGRATOR_URL },
  })
  const boss = createBoss({ connectionString: process.env.TEST_DATABASE_URL!, role: 'worker' })
  await boss.start()
  await boss.stop({ graceful: false })
}
