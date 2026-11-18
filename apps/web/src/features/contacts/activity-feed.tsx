'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { useContactActivity } from './queries.ts'

/** Timeline of the contact (what happened and who did it), newest first. */
export function ActivityFeed({ contactId }: { contactId: string }) {
  const t = useTranslations('contacts.activity')
  const format = useFormatter()
  const orgId = useOrganizationId()
  const activity = useContactActivity(orgId, contactId)
  const items = activity.data ?? []

  if (items.length === 0) {
    return <p className="text-sm text-foreground-lighter">{t('empty')}</p>
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="text-foreground">
            {t.has(`types.${a.type}`) ? t(`types.${a.type}`) : a.type}
            {a.actorName ? (
              <span className="text-foreground-lighter"> · {t('by', { name: a.actorName })}</span>
            ) : null}
          </span>
          <time dateTime={a.createdAt} className="shrink-0 text-xs text-foreground-lighter">
            {format.dateTime(new Date(a.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        </li>
      ))}
    </ul>
  )
}
