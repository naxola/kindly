import { config as loadEnv } from 'dotenv'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// In development, variables live in the monorepo root .env. In production they come from
// the container environment and this file does not exist.
loadEnv({ path: new URL('../../.env', import.meta.url).pathname, quiet: true })

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: { position: 'bottom-right' },
  // Workspace packages are published as TypeScript source.
  transpilePackages: ['@saas/ui', '@saas/config', '@saas/core', '@saas/database', '@saas/adapters'],
  serverExternalPackages: ['pg', 'pino', 'pino-pretty', '@sentry/node'],
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(config)
