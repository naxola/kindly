import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

config({ path: new URL('../../.env', import.meta.url).pathname, quiet: true })

// Migrations always run as the app_migrator role (ADR 0002).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: env('DATABASE_MIGRATOR_URL'),
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
