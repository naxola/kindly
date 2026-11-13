'use client'

import { Badge } from '@saas/ui'
import { useFormatter, useTranslations } from 'next-intl'
import type { KnowledgeVersionData } from './queries.ts'

export const STATUS_BADGE = {
  DRAFT: 'default',
  CURRENT: 'success',
  SUPERSEDED: 'warning',
  REPEALED: 'destructive',
  HISTORICAL: 'default',
} as const

/** Validity is a range of days, not instants: shown in UTC so it never shifts. */
export function useValidity() {
  const t = useTranslations('knowledge')
  const format = useFormatter()
  const fmt = (d: string) =>
    format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })
  return (from: string, until: string | null) =>
    until ? t('period', { from: fmt(from), to: fmt(until) }) : t('since', { date: fmt(from) })
}

/** Where a version's ingestion stands; a failure shows its stable code translated. */
export function IngestionState({ version }: { version: KnowledgeVersionData }) {
  const t = useTranslations('knowledge.ingestion')
  if (version.ingestionStatus === 'READY') return null
  const failed = version.ingestionStatus === 'FAILED'
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge variant={failed ? 'destructive' : 'default'}>{t(version.ingestionStatus)}</Badge>
      {failed && version.ingestionError ? (
        <span role="alert" className="text-xs text-destructive">
          {t.has(`codes.${version.ingestionError}`)
            ? t(`codes.${version.ingestionError}`)
            : t('codes.EXTRACTION_FAILED')}
        </span>
      ) : null}
    </span>
  )
}
