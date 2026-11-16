import { Skeleton } from '@saas/ui'
import { getTranslations } from 'next-intl/server'

/** Shown while a page of the application streams in. */
export default async function Loading() {
  const t = await getTranslations('states')
  return (
    <div role="status" aria-busy="true" className="space-y-4 p-6">
      <span className="sr-only">{t('loading')}</span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
