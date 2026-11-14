import { buttonVariants, cn } from '@saas/ui'
import { getTranslations } from 'next-intl/server'
import NextLink from 'next/link'

export default async function NotFound() {
  const t = await getTranslations('states')
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-sm text-foreground-lighter">404</p>
      <h1 className="text-xl text-foreground">{t('notFoundTitle')}</h1>
      <p className="text-sm text-foreground-light">{t('notFoundBody')}</p>
      <NextLink href="/" className={cn(buttonVariants({ variant: 'primary', size: 'small' }))}>
        {t('goHome')}
      </NextLink>
    </main>
  )
}
