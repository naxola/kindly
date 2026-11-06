import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale } from './routing.ts'

/** The locale comes from the URL segment (/es, /en), set with setRequestLocale in each page. */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE
  const messages = (await import(`../../messages/${locale}.json`)) as {
    default: Record<string, unknown>
  }
  return { locale, messages: messages.default, timeZone: 'Europe/Madrid' }
})
