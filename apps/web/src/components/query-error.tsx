'use client'

import { Button, Callout } from '@saas/ui'
import { useTranslations } from 'next-intl'
import { ApiError, errorText } from '@/client/errors.ts'

/**
 * Failed query: the translated reason, the correlation id to quote to support, and a way to
 * try again. Used instead of an empty table, which would look like "no data".
 */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations()
  const reference = error instanceof ApiError ? error.correlationId : null
  return (
    <Callout variant="destructive" title={t('states.loadFailed')}>
      <p>{errorText(t, error)}</p>
      {reference ? (
        <p className="mt-1 text-xs">{t('states.reference', { id: reference })}</p>
      ) : null}
      <Button size="tiny" className="mt-2" onClick={onRetry}>
        {t('states.retry')}
      </Button>
    </Callout>
  )
}
