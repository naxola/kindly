/**
 * Creates or upgrades the pg-boss tables (schema `pgboss`). The web only enqueues and never
 * runs DDL; the worker migrates them on start. This command makes a fresh database ready
 * regardless of which process starts first: run it right after `db:deploy` in every
 * deployment, and before integration and e2e tests.
 */
import { config } from 'dotenv'
import { createBoss } from '@saas/adapters/queue'

config({ path: new URL('../.env', import.meta.url).pathname, quiet: true })

export async function installQueue(connectionString: string) {
  const boss = createBoss({ connectionString, role: 'worker' })
  await boss.start()
  await boss.stop({ graceful: false })
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  await installQueue(url)
  console.log('✔ pg-boss tables ready')
}
