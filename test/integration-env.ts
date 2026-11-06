// Integration tests always use the test database (TEST_*), never the development one.
import { config } from 'dotenv'

config({ path: new URL('../.env', import.meta.url).pathname, quiet: true })

const required = ['TEST_DATABASE_URL', 'TEST_DATABASE_MIGRATOR_URL'] as const
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key} for integration tests`)
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
process.env.DATABASE_MIGRATOR_URL = process.env.TEST_DATABASE_MIGRATOR_URL
// Tests sign up and sign in many times from the same IP.
process.env.AUTH_RATE_LIMIT_ENABLED = 'false'
process.env.LOG_LEVEL = 'silent'
