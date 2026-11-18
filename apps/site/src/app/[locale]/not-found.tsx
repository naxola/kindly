import { buttonVariants, cn } from '@saas/ui'
import { getLocale, getTranslations } from 'next-intl/server'
import NextLink from 'next/link'

/** Unknown page under a locale (and the `notFound()` of posts and legal documents). */
export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations('states'), getLocale()])
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-sm text-foreground-lighter">404</p>
      <h1 className="text-xl text-foreground">{t('notFoundTitle')}</h1>
      <p className="text-sm text-foreground-light">{t('notFoundBody')}</p>
      <NextLink
        href={`/${locale}`}
        className={cn(buttonVariants({ variant: 'primary', size: 'small' }))}
      >
        {t('goHome')}
      </NextLink>
    </div>
  )
}
