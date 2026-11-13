import { getTranslations } from 'next-intl/server'
import NextLink from 'next/link'
import type { Locale } from '@/i18n/routing.ts'
import { site } from '@/site.config.ts'
import { LanguageSwitch } from './language-switch.tsx'

export const LEGAL_DOCS = ['privacy', 'terms', 'legal-notice', 'data-deletion', 'cookies'] as const

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale })
  return (
    <footer className="border-t border-border bg-background-alt">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-sm text-foreground-lighter">
        <span>
          {t('footer.rights', { year: new Date().getFullYear(), company: site.legal.companyName })}
        </span>
        <nav aria-label={t('footer.legal')} className="flex flex-wrap gap-4">
          {LEGAL_DOCS.map((doc) => (
            <NextLink key={doc} className="hover:text-foreground" href={`/${locale}/legal/${doc}`}>
              {t(`legal.${doc}`)}
            </NextLink>
          ))}
          <NextLink className="hover:text-foreground" href={`/${locale}/blog/rss.xml`}>
            {t('blog.rss')}
          </NextLink>
        </nav>
        <div className="ml-auto">
          <LanguageSwitch current={locale} label={t('nav.language')} />
        </div>
      </div>
    </footer>
  )
}
