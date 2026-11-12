import type { Metadata } from 'next'
import { LOCALES, type Locale } from './i18n/routing.ts'
import { site } from './site.config.ts'

/** Canonical URL and hreflang alternates of a path that exists in every locale. */
export function localized(locale: Locale, path = ''): Pick<Metadata, 'alternates'> {
  return {
    alternates: {
      canonical: `${site.url}/${locale}${path}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${site.url}/${l}${path}`])),
    },
  }
}
