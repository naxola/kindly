import { config as loadEnv } from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E of the critical journeys. Runs the production build of the web against the test
 * database, on its own port so it does not clash with `pnpm dev`.
 */
loadEnv({ path: new URL('.env', import.meta.url).pathname, quiet: true })

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`
/** Public site (apps/site), on its own port. */
export const SITE_PORT = 3200
export const SITE_URL = `http://localhost:${SITE_PORT}`

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    locale: 'es-ES',
    ...devices['Desktop Chrome'],
    // Where Chromium is preinstalled (e.g. containers), its path is given here.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  webServer: [
    {
      command: `pnpm --filter @saas/web build && pnpm --filter @saas/web exec next start --port ${PORT}`,
      url: `${BASE_URL}/api/health`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        // The development .env sets NODE_ENV=development; build and `next start` need production.
        NODE_ENV: 'production',
        APP_URL: BASE_URL,
        DATABASE_URL: process.env.TEST_DATABASE_URL!,
        AUTH_RATE_LIMIT_ENABLED: 'false',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm --filter @saas/site build && pnpm --filter @saas/site exec next start --port ${SITE_PORT}`,
      url: `${SITE_URL}/robots.txt`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: { NODE_ENV: 'production', SITE_URL, APP_URL: BASE_URL },
    },
  ],
})
