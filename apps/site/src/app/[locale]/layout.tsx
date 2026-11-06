import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import Script from 'next/script'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer.tsx'
import { SiteHeader } from '@/components/site-header.tsx'
import { isLocale, LOCALES } from '@/i18n/routing.ts'
import { site } from '@/site.config.ts'
import '../globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const dynamicParams = false
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }))

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return {
    metadataBase: new URL(site.url),
    title: { default: t('site.name'), template: `%s · ${t('site.name')}` },
    description: t('site.tagline'),
    openGraph: { siteName: t('site.name'), locale, type: 'website' },
    alternates: {
      types: { 'application/rss+xml': `${site.url}/${locale}/blog/rss.xml` },
    },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  return (
    <html lang={locale} className={inter.variable}>
      <body className="flex min-h-dvh flex-col bg-background">
        <NextIntlClientProvider>
          <SiteHeader locale={locale} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter locale={locale} />
        </NextIntlClientProvider>
        {/* Plausible: cookieless analytics, only when configured. */}
        {site.plausibleDomain ? (
          <Script
            defer
            data-domain={site.plausibleDomain}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  )
}
