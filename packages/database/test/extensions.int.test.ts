import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * pgvector is created by infra/postgres/init/00-roles.sh (only a superuser can) and checked
 * by a migration. The application role must be able to use it without being a superuser.
 */
let client: pg.Client

beforeAll(async () => {
  client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
})

afterAll(async () => {
  await client.end()
})

describe('pgvector', () => {
  it('is installed in the extensions schema', async () => {
    const { rows } = await client.query<{ schema: string }>(
      `SELECT n.nspname AS schema FROM pg_extension e
       JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector'`,
    )
    expect(rows).toEqual([{ schema: 'extensions' }])
  })

  it('works for the application role, which is not a superuser', async () => {
    const { rows } = await client.query<{ superuser: boolean; distance: number }>(
      `SELECT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser,
              '[1,2,3]'::vector <-> '[1,2,6]'::vector AS distance`,
    )
    expect(rows[0]).toEqual({ superuser: false, distance: 3 })
  })
})
