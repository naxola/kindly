'use client'

import { usePathname } from 'next/navigation'
import NextLink from 'next/link'
import { LOCALES, type Locale } from '@/i18n/routing.ts'

const NAMES: Record<Locale, string> = { es: 'Español', en: 'English' }

/** Same page in the other locale. Pages exist in both, so the path is kept. */
export function LanguageSwitch({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname()
  const rest = pathname.replace(/^\/(es|en)(?=\/|$)/, '')
  return (
    <nav aria-label={label} className="flex items-center gap-2 text-sm">
      {LOCALES.map((locale) => (
        <NextLink
          key={locale}
          href={`/${locale}${rest}`}
          hrefLang={locale}
          aria-current={locale === current ? 'true' : undefined}
          className={
            locale === current ? 'text-foreground' : 'text-foreground-lighter hover:text-foreground'
          }
        >
          {NAMES[locale]}
        </NextLink>
      ))}
    </nav>
  )
}
