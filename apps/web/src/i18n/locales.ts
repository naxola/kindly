export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale)

/** Picks the language from Accept-Language (no library needed). */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag = '', q] = part.trim().split(';q=')
      return { lang: tag.toLowerCase().split('-')[0], q: q ? Number(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)
  return ranked.map((r) => r.lang).find(isLocale) ?? DEFAULT_LOCALE
}
