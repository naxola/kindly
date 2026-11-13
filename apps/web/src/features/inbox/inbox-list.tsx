'use client'

import { Badge, Button, Callout, cn, EmptyState, Input, Select } from '@saas/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { errorText } from '@/client/errors.ts'
import { useMembers } from '@/client/queries.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import {
  conversationQuery,
  threadQuery,
  useConversations,
  useInboxChannels,
  useInboxCounts,
  type InboxFilters,
  type InboxView,
} from './queries.ts'

const VIEWS: InboxView[] = ['pending', 'unread', 'unassigned', 'all']
const isView = (v: string | null): v is InboxView => !!v && (VIEWS as string[]).includes(v)

/**
 * The inbox: one list of conversations with four views, counters, search and filters. The state
 * lives in the URL (shareable, survives a reload and the back button). The open conversation is
 * `?conversation=<id>`: the list stays beside it, with its row marked.
 */
export function InboxList({
  selectedId,
  onOpen,
}: {
  selectedId: string | null
  onOpen: (id: string) => void
}) {
  const t = useTranslations('inbox')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const canSeeAll = useCan()('channels.read_all')
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const filters: InboxFilters = {
    view: isView(params.get('view')) ? (params.get('view') as InboxView) : 'pending',
    search: params.get('q') ?? '',
    channel: params.get('channel') ?? '',
    delegateId: params.get('delegate') ?? '',
  }
  const set = (patch: Partial<Record<'view' | 'q' | 'channel' | 'delegate', string>>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }

  // The search box edits locally and reaches the URL (and the server) after a short pause.
  const [text, setText] = useState(filters.search)
  useEffect(() => {
    setText(filters.search)
  }, [filters.search])
  useEffect(() => {
    if (text === filters.search) return
    const id = setTimeout(() => set({ q: text.trim() }), 300)
    return () => clearTimeout(id)
  }, [text])

  const list = useConversations(orgId, filters)
  const counts = useInboxCounts(orgId, filters.channel, filters.delegateId)
  const channels = useInboxChannels(orgId)
  // Only administrators can read the member list, and only they see every delegate's mailbox.
  const members = useMembers(orgId)
  const names = new Map((members.data ?? []).map((m) => [m.id, m.displayName]))
  const items = list.data ?? []

  const when = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    return d.toDateString() === today.toDateString()
      ? format.dateTime(d, { timeStyle: 'short' })
      : format.dateTime(d, { dateStyle: 'medium' })
  }

  // Hovering or focusing a row warms the conversation, so opening it is instant. It never marks it
  // read: that is the open thread's job.
  const warm = (id: string) => {
    void qc.prefetchQuery(conversationQuery(orgId, id))
    void qc.prefetchQuery(threadQuery(orgId, id))
  }
  const hrefOf = (id: string) => {
    const next = new URLSearchParams(params.toString())
    next.set('conversation', id)
    return `${pathname}?${next.toString()}`
  }

  return (
    <>
      <div className="space-y-4 p-4 lg:px-6">
        <div role="group" aria-label={t('title')} className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <Button
              key={v}
              size="tiny"
              variant={filters.view === v ? 'primary' : 'ghost'}
              aria-pressed={filters.view === v}
              onClick={() => set({ view: v === 'pending' ? '' : v })}
            >
              {t(`views.${v}`)}
              {counts.data ? (
                <span className="ml-1 tabular-nums opacity-80">{counts.data[v]}</span>
              ) : null}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            type="search"
            aria-label={t('searchLabel')}
            placeholder={t('search')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full max-w-72"
          />
          {(channels.data?.length ?? 0) > 1 ? (
            <Select
              aria-label={t('filters.channel')}
              value={filters.channel}
              onChange={(e) => set({ channel: e.target.value })}
              className="w-48"
            >
              <option value="">{t('filters.allChannels')}</option>
              {(channels.data ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          ) : null}
          {canSeeAll && (members.data?.length ?? 0) > 1 ? (
            <Select
              aria-label={t('filters.delegate')}
              value={filters.delegateId}
              onChange={(e) => set({ delegate: e.target.value })}
              className="w-48"
            >
              <option value="">{t('filters.allDelegates')}</option>
              {(members.data ?? [])
                .filter((m) => m.status === 'ACTIVE')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
            </Select>
          ) : null}
        </div>
        {list.error ? <Callout variant="destructive">{errorText(all, list.error)}</Callout> : null}
        {items.length === 0 && !list.isPending ? (
          <EmptyState
            icon={<Inbox />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((c) => {
              const mine = c.referenceDelegateId === c.delegateId
              const ref =
                c.referenceDelegateId && !mine ? names.get(c.referenceDelegateId) : undefined
              return (
                <li key={c.id}>
                  <Link
                    href={hrefOf(c.id)}
                    prefetch={false}
                    aria-current={c.id === selectedId ? 'true' : undefined}
                    onPointerEnter={() => warm(c.id)}
                    onFocus={() => warm(c.id)}
                    onClick={(e) => {
                      // The same page with another query: no server trip. A modified click keeps
                      // its normal meaning (new tab).
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                      e.preventDefault()
                      if (c.id !== selectedId) onOpen(c.id)
                    }}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 hover:bg-surface-100',
                      c.id === selectedId && 'bg-brand-subtle hover:bg-brand-subtle',
                    )}
                  >
                    <span
                      aria-label={c.unread ? t('row.unread') : undefined}
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        c.unread ? 'bg-brand' : 'bg-transparent',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn('truncate text-sm', c.unread && 'font-semibold')}>
                          {c.contactName}
                        </span>
                        {c.contactIsUnassigned ? (
                          <Badge variant="warning">{t('row.unassigned')}</Badge>
                        ) : null}
                        {ref ? <Badge variant="brand">{t('row.ref', { name: ref })}</Badge> : null}
                        <Badge>{c.channel}</Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-foreground-lighter">
                        {c.lastMessage
                          ? `${c.lastMessage.direction === 'OUTBOUND' ? `${t('row.you')}: ` : ''}${c.lastMessage.body}`
                          : t('row.noMessages')}
                      </span>
                    </span>
                    {c.lastMessage ? (
                      <time
                        dateTime={c.lastMessage.createdAt}
                        className="shrink-0 text-xs text-foreground-lighter"
                      >
                        {when(c.lastMessage.createdAt)}
                      </time>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
