import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from './locales.ts'

/**
 * No per-locale routes. Priority: this browser's cookie → Accept-Language. The user's
 * and the organization's preferences join in with the workspace (phase 4b).
 */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale: Locale = isLocale(fromCookie)
    ? fromCookie
    : negotiateLocale((await headers()).get('accept-language'))
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>
  }
  return { locale, messages: messages.default, timeZone: 'Europe/Madrid' }
})
