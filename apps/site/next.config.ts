import { config as loadEnv } from 'dotenv'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

// In development, variables live in the monorepo root .env.
loadEnv({ path: new URL('../../.env', import.meta.url).pathname, quiet: true })

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@saas/ui', '@saas/config', '@saas/content'],
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  // Pages are prerendered per locale (/es, /en); the bare domain goes to the default one.
  redirects: () => Promise.resolve([{ source: '/', destination: '/es', permanent: false }]),
}

export default createNextIntlPlugin('./src/i18n/request.ts')(config)
