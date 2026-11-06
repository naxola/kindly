import { execFileSync } from 'node:child_process'
import pg from 'pg'
import './integration-env.ts'

/** Applies the migrations to the test database and empties its tables and its job queue. */
export default async function setup() {
  execFileSync('pnpm', ['--filter', '@saas/database', 'exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  })
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_MIGRATOR_URL })
  await client.connect()
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    )
    if (rows.length > 0) {
      await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} CASCADE`)
    }
  } finally {
    await client.end()
  }
  // Jobs left by earlier runs (e2e uses the same database) would make the worker tests
  // drain a backlog first. pg-boss tables belong to app_user, so it empties them.
  const queue = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL })
  await queue.connect()
  try {
    const { rows } = await queue.query(`SELECT to_regclass('pgboss.job') AS t`)
    if (rows[0]?.t) await queue.query('TRUNCATE pgboss.job')
  } finally {
    await queue.end()
  }
}
