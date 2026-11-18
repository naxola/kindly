import { buttonVariants } from '@saas/ui'
import { getTranslations } from 'next-intl/server'
import NextLink from 'next/link'
import type { Locale } from '@/i18n/routing.ts'
import { site } from '@/site.config.ts'

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale })
  const name = t('site.name')
  return (
    <header className="border-b border-border bg-background-alt">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <NextLink href={`/${locale}`} className="flex items-center gap-2 text-sm text-foreground">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-md bg-brand font-mono text-xs font-semibold text-brand-foreground"
          >
            {name.charAt(0).toUpperCase()}
          </span>
          {name}
        </NextLink>
        <nav aria-label={t('nav.main')} className="hidden items-center gap-4 text-sm sm:flex">
          <NextLink
            className="text-foreground-light hover:text-foreground"
            href={`/${locale}/pricing`}
          >
            {t('nav.pricing')}
          </NextLink>
          <NextLink
            className="text-foreground-light hover:text-foreground"
            href={`/${locale}/blog`}
          >
            {t('nav.blog')}
          </NextLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a className={buttonVariants({ size: 'small' })} href={`${site.appUrl}/sign-in`}>
            {t('nav.signIn')}
          </a>
          <a
            className={buttonVariants({ variant: 'primary', size: 'small' })}
            href={`${site.appUrl}/sign-up`}
          >
            {t('nav.signUp')}
          </a>
        </div>
      </div>
    </header>
  )
}
