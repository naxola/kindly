import { execFileSync } from 'node:child_process'
import pg from 'pg'
import './integration-env.ts'

/** Applies the migrations to the test database and empties its tables before the run. */
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
}
