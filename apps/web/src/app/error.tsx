'use client'

import { Button } from '@saas/ui'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

/**
 * Last resort of a page: something failed while rendering. The `digest` is the id Next
 * prints in the server log for this failure, so it is what support needs to find it.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('states')
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl text-foreground">{t('errorTitle')}</h1>
      <p className="text-sm text-foreground-light">{t('errorBody')}</p>
      {error.digest ? (
        <p className="text-xs text-foreground-lighter">{t('reference', { id: error.digest })}</p>
      ) : null}
      <Button variant="primary" size="small" onClick={reset}>
        {t('retry')}
      </Button>
    </main>
  )
}
