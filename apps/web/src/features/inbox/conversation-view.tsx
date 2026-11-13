'use client'

import { Badge, Button, Callout, cn, EmptyState, Textarea } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquareOff } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { ApiError, errorText, unwrap } from '@/client/errors.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { inboxKeys, useConversation, useThread } from './queries.ts'

const TICKS: Record<string, string> = { PENDING: '…', SENT: '✓', DELIVERED: '✓✓', READ: '✓✓' }

/**
 * A conversation: the thread, and a composer only for whoever can actually reply (the owner of the
 * account, while it is connected and the provider's window is open). Anyone else reads. Opening it
 * marks it read.
 */
export function ConversationView({ conversationId }: { conversationId: string }) {
  const t = useTranslations('inbox')
  const c = useTranslations('inbox.conversation')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const conversation = useConversation(orgId, conversationId)
  const thread = useThread(orgId, conversationId)
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  // Opening it marks it read; a new message arriving while it is open is read too.
  const lastId = thread.data?.at(-1)?.id
  const markRead = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/conversations/{id}/read', {
          params: { path: { id: conversationId } },
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: [...inboxKeys.all(orgId), 'counts'] }),
  })
  useEffect(() => {
    if (lastId && conversation.data) markRead.mutate()
  }, [lastId, !!conversation.data])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [lastId])

  const send = useMutation({
    mutationFn: async (text: string) =>
      unwrap(
        await apiClient.POST('/api/v1/conversations/{id}/messages', {
          params: { path: { id: conversationId } },
          body: { text },
        }),
      ),
    onSuccess: async () => {
      setDraft('')
      await Promise.all([
        qc.invalidateQueries({ queryKey: inboxKeys.thread(orgId, conversationId) }),
        qc.invalidateQueries({ queryKey: inboxKeys.detail(orgId, conversationId) }),
        qc.invalidateQueries({ queryKey: [...inboxKeys.all(orgId), 'list'] }),
        qc.invalidateQueries({ queryKey: [...inboxKeys.all(orgId), 'counts'] }),
      ])
    },
  })

  if (conversation.error) {
    // Not visible and not existing look the same on purpose (404).
    const missing = conversation.error instanceof ApiError && conversation.error.status === 404
    return (
      <PageContainer>
        <EmptyState
          icon={<MessageSquareOff />}
          title={missing ? t('notFound') : errorText(all, conversation.error)}
          action={
            <Button asChild>
              <Link href="/inbox">{t('back')}</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  const d = conversation.data
  if (!d) return null

  const messages = thread.data ?? []
  const closed = d.serviceWindow.status === 'CLOSED'
  const notice = !d.canReply
    ? d.account.status !== 'CONNECTED' && d.account.status !== 'DEGRADED'
      ? c('notConnected')
      : closed
        ? c('windowClosed')
        : null
    : null

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const text = draft.trim()
    if (text) send.mutate(text)
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {d.contact.name}
            {d.contact.isUnassigned ? <Badge variant="warning">{t('row.unassigned')}</Badge> : null}
            <Badge>{d.channel}</Badge>
          </span>
        }
        description={[d.contact.phone, c('account', { name: d.account.delegateName })]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <Button asChild size="small">
            <Link href={`/contacts/${d.contact.id}`}>{c('openContact')}</Link>
          </Button>
        }
      />
      <PageContainer className="max-w-3xl space-y-4">
        {d.serviceWindow.status === 'OPEN' && d.serviceWindow.expiresAt && d.canReply ? (
          <p className="text-xs text-foreground-lighter">
            {c('windowOpen', {
              date: format.dateTime(new Date(d.serviceWindow.expiresAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </p>
        ) : null}
        <div
          role="log"
          aria-label={t('title')}
          className="space-y-2 rounded-lg border border-border bg-surface-100 p-4"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-foreground-lighter">{c('empty')}</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex', m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                    m.direction === 'OUTBOUND'
                      ? 'bg-brand-subtle text-foreground'
                      : 'border border-border bg-background text-foreground',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-1 flex items-center justify-end gap-2 text-[11px] text-foreground-lighter">
                    {m.sentFromDevice ? <span>{c('fromDevice')}</span> : null}
                    <time dateTime={m.createdAt}>
                      {format.dateTime(new Date(m.createdAt), {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </time>
                    {m.direction === 'OUTBOUND' ? (
                      m.deliveryStatus === 'FAILED' ? (
                        <span className="text-destructive">{c('status.FAILED')}</span>
                      ) : (
                        <span
                          aria-label={c(`status.${m.deliveryStatus}`)}
                          className={m.deliveryStatus === 'READ' ? 'text-brand' : undefined}
                        >
                          {TICKS[m.deliveryStatus]}
                        </span>
                      )
                    ) : null}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={bottom} />
        </div>

        {d.canReply ? (
          <form onSubmit={onSubmit} className="space-y-2">
            {send.error ? (
              <Callout variant="destructive">{errorText(all, send.error)}</Callout>
            ) : null}
            <Textarea
              aria-label={c('composerLabel')}
              placeholder={c('placeholder')}
              rows={3}
              maxLength={4096}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={send.isPending || !draft.trim()}>
                {c('send')}
              </Button>
            </div>
          </form>
        ) : (
          <Callout variant="info">
            {notice ?? c('readOnly', { name: d.account.delegateName })}
          </Callout>
        )}
      </PageContainer>
    </>
  )
}
