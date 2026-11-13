'use client'

import { Badge } from '@saas/ui'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { STATUS_BADGE, useValidity } from './parts.tsx'
import type { KnowledgeResult } from './queries.ts'

/**
 * A retrieved fragment with its verifiable provenance: source, version, validity and location are
 * always shown (product principle 3). The evidence level is deliberately absent: it is the Copilot's
 * judgement of how well a text supports an answer, not a property of retrieval.
 */
export function CitationCard({ result: r }: { result: KnowledgeResult }) {
  const t = useTranslations('knowledge')
  const validity = useValidity()
  // The label already says "Artículo 1"; the level is only the fallback when there is none.
  const location = r.label ?? t(`level.${r.level}`)
  return (
    <article className="space-y-1 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/knowledge/${r.documentId}`} className="text-sm font-medium hover:underline">
          {r.documentTitle}
        </Link>
        <Badge variant={STATUS_BADGE[r.status]}>{t(`status.${r.status}`)}</Badge>
        <Badge>{t(`visibility.${r.visibility}`)}</Badge>
      </div>
      <p className="text-sm text-foreground-lighter">
        {t('version', { version: r.version })} · {validity(r.effectiveFrom, r.effectiveUntil)}
        {r.sourceNote ? ` · ${r.sourceNote}` : ''}
      </p>
      <p className="text-sm text-foreground-lighter">
        {location}
        {r.path && r.path !== r.label ? ` · ${r.path}` : ''}
      </p>
      <blockquote className="whitespace-pre-line border-l-2 border-border pl-3 text-sm">
        {r.content}
      </blockquote>
      {r.documentSourceUrl ? (
        <a
          href={r.documentSourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-foreground-lighter underline"
        >
          {t('viewSource')}
        </a>
      ) : null}
    </article>
  )
}
