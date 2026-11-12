import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'
import { getWorkspace } from '@/server/viewer.ts'
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from './locales.ts'

/**
 * No per-locale routes. Priority: this browser's choice (cookie) → the person's preference
 * → the active organization's default → Accept-Language.
 */
export default getRequestConfig(async () => {
  const workspace = await getWorkspace()
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value
  const candidates = [fromCookie, workspace?.user?.locale, workspace?.active?.defaultLocale]
  const locale: Locale =
    candidates.find(isLocale) ?? negotiateLocale((await headers()).get('accept-language'))
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>
  }
  return { locale, messages: messages.default, timeZone: 'Europe/Madrid' }
})
