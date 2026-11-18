import { baseEnv, browserErrorsEnv, parseEnv } from '@saas/config/env'
import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import type { ReactNode } from 'react'
import { BrowserErrors } from '@/components/browser-errors.tsx'
import { Providers } from '@/components/providers.tsx'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app')
  return { title: { default: t('name'), template: `%s · ${t('name')}` } }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  // Nonce set by the proxy (R2.1); tags the inline script of next-themes.
  const nonce = (await headers()).get('x-nonce') ?? undefined
  // Runtime variables (the image carries none): the browser DSN and the environment name.
  const { SENTRY_BROWSER_DSN } = parseEnv(browserErrorsEnv)
  const { APP_ENV } = parseEnv(baseEnv.pick({ APP_ENV: true }))
  return (
    <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <body>
        <BrowserErrors dsn={SENTRY_BROWSER_DSN} environment={APP_ENV} />
        <NextIntlClientProvider>
          <Providers nonce={nonce}>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
