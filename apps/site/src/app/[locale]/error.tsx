'use client'

import { Button } from '@saas/ui'
import { useTranslations } from 'next-intl'

/** A page of the public site failed while rendering. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('states')
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <h1 className="text-xl text-foreground">{t('errorTitle')}</h1>
      <p className="text-sm text-foreground-light">{t('errorBody')}</p>
      {error.digest ? (
        <p className="text-xs text-foreground-lighter">{t('reference', { id: error.digest })}</p>
      ) : null}
      <Button variant="primary" size="small" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  )
}
