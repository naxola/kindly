'use client'

import { Button, EmptyState, Select, Table, TBody, TD, TH, THead, TR } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { apiClient } from '@/client/api.ts'
import { unwrap } from '@/client/errors.ts'
import { QueryError } from '@/components/query-error.tsx'
import { TableSkeleton } from '@/components/table-skeleton.tsx'
import { useOrganizationId } from '@/components/workspace-context.tsx'

/** Groups of actions offered as a filter (prefixes of the audit action). */
const AREAS = ['organization', 'member', 'invitation', 'billing'] as const

/**
 * Activity of the organization (ADR 0018): who did what and when, newest first. Read-only; the
 * API decides who may see it (ADMIN).
 */
export function ActivitySettings() {
  const t = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const [area, setArea] = useState('')
  const activity = useInfiniteQuery({
    queryKey: ['org', orgId, 'activity', area],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await apiClient.GET('/api/v1/audit-logs', {
          params: {
            query: {
              limit: 25,
              ...(pageParam ? { cursor: pageParam } : {}),
              ...(area ? { action: `${area}.` } : {}),
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const items = activity.data?.pages.flatMap((p) => p.items) ?? []
  // Known actions have a readable name; a product's own actions show their code.
  const actionLabel = (action: string) => {
    const key = `settings.activity.actions.${action.replaceAll('.', '_')}`
    return t.has(key) ? t(key) : action
  }

  return (
    <>
      <PageHeader
        title={t('settings.activity.title')}
        description={t('settings.activity.description')}
      />
      <PageContainer className="space-y-4">
        <label className="flex items-center gap-2 text-xs text-foreground-light">
          {t('settings.activity.filter')}
          <Select value={area} onChange={(e) => setArea(e.target.value)} className="w-48">
            <option value="">{t('settings.activity.all')}</option>
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {t(`settings.activity.areas.${a}`)}
              </option>
            ))}
          </Select>
        </label>
        {activity.isPending ? (
          <TableSkeleton rows={5} label={t('states.loading')} />
        ) : activity.isError ? (
          <QueryError error={activity.error} onRetry={() => void activity.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title={t('settings.activity.empty')} />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>{t('settings.activity.when')}</TH>
                  <TH>{t('settings.activity.who')}</TH>
                  <TH>{t('settings.activity.what')}</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((i) => (
                  <TR key={i.id}>
                    <TD className="whitespace-nowrap text-xs text-foreground-light">
                      {format.dateTime(new Date(i.createdAt), {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </TD>
                    <TD>{i.actor ? i.actor.displayName || '—' : t('settings.activity.system')}</TD>
                    <TD>{actionLabel(i.action)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {activity.hasNextPage ? (
              <Button
                size="small"
                disabled={activity.isFetchingNextPage}
                onClick={() => void activity.fetchNextPage()}
              >
                {t('settings.activity.more')}
              </Button>
            ) : null}
          </>
        )}
      </PageContainer>
    </>
  )
}
