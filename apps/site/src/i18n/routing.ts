import type { ContentLocale } from '@saas/content'

/**
 * Locales of the site. Defined here (not imported from @saas/content) because client
 * components use them and the content package reads files on the server. The type keeps
 * both lists in sync.
 */
export const LOCALES = ['es', 'en'] as const satisfies readonly ContentLocale[]
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'es'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
