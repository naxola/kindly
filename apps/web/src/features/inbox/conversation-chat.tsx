'use client'

import { Button, Callout, cn, EmptyState, Textarea } from '@saas/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, Send } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { useMemberId, useOrganizationId } from '@/components/workspace-context.tsx'
import { DeliveryTicks, type DisplayStatus } from './delivery-ticks.tsx'
import {
  inboxKeys,
  useThread,
  type ConversationDetailData,
  type ThreadMessageData,
} from './queries.ts'

/** The composer asks for a "typing…" signal at most this often (the provider shows it for seconds). */
const TYPING_SIGNAL_EVERY_MS = 20_000
const NEAR_BOTTOM_PX = 80
const COMPOSER_MAX_PX = 144

interface Pending {
  tempId: string
  body: string
  createdAt: string
  status: 'SENDING' | 'FAILED'
  error?: string
}

interface Entry {
  key: string
  direction: 'INBOUND' | 'OUTBOUND'
  body: string
  createdAt: string
  status: DisplayStatus
  sentFromDevice: boolean
  error?: string
  onRetry?: () => void
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const draftKey = (conversationId: string) => `kindly:draft:${conversationId}`

/**
 * The thread and the composer of a conversation. Sending is optimistic: the message shows at once
 * with a clock, the box empties, and the request happens behind it (a failure leaves the bubble with
 * the reason and a retry). It polls for new messages and delivery marks; a reader who scrolled up is
 * not dragged down but offered "new messages". The draft survives closing the panel (per
 * conversation, in `sessionStorage`). Whoever cannot reply sees the thread and the reason.
 * Mounted once per conversation (`key`).
 */
export function ConversationChat({
  conversationId,
  detail,
}: {
  conversationId: string
  detail: ConversationDetailData
}) {
  const t = useTranslations('inbox')
  const c = useTranslations('inbox.conversation')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const myMemberId = useMemberId()
  const qc = useQueryClient()
  const thread = useThread(orgId, conversationId)
  const messages = thread.data
  const [pending, setPending] = useState<Pending[]>([])
  const [draft, setDraft] = useState('')
  const [live, setLive] = useState(false)
  const [hasNew, setHasNew] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const atBottom = useRef(true)
  const lastTyping = useRef(0)
  const seen = useRef(0)

  const closed = detail.serviceWindow.status === 'CLOSED'
  const connected = detail.account.status === 'CONNECTED' || detail.account.status === 'DEGRADED'

  // The initial history is not announced to a screen reader; what arrives afterwards is.
  useEffect(() => {
    const id = setTimeout(() => setLive(true), 0)
    return () => clearTimeout(id)
  }, [])

  // The draft of this conversation, if the panel was closed with something written.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(draftKey(conversationId))
      if (saved) setDraft(saved)
    } catch {
      /* storage unavailable: no draft kept */
    }
  }, [conversationId])
  function changeDraft(value: string) {
    setDraft(value)
    try {
      if (value) sessionStorage.setItem(draftKey(conversationId), value)
      else sessionStorage.removeItem(draftKey(conversationId))
    } catch {
      /* storage unavailable */
    }
    const now = Date.now()
    if (
      detail.canReply &&
      detail.supportsTyping &&
      value.trim() &&
      now - lastTyping.current > TYPING_SIGNAL_EVERY_MS
    ) {
      lastTyping.current = now
      // A courtesy: never worth an error on screen.
      void apiClient
        .POST('/api/v1/conversations/{id}/typing', { params: { path: { id: conversationId } } })
        .catch(() => undefined)
    }
  }
  // The box grows with what is written, up to a few lines.
  useEffect(() => {
    const el = composer.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`
  }, [draft])
  // On a wide screen the cursor is already where the reply goes (on a phone it would open the keyboard).
  useEffect(() => {
    if (detail.canReply && window.matchMedia('(min-width: 1280px)').matches)
      composer.current?.focus()
  }, [detail.canReply])

  // Opening it marks it read; so does a new message arriving while it is open.
  const lastId = messages?.at(-1)?.id
  const markRead = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/conversations/{id}/read', {
          params: { path: { id: conversationId } },
        }),
      ),
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: [...inboxKeys.all(orgId), 'counts'] }),
        qc.invalidateQueries({ queryKey: [...inboxKeys.all(orgId), 'list'] }),
      ]),
  })
  useEffect(() => {
    if (lastId) markRead.mutate()
  }, [lastId])

  // Scroll only the thread's own container (never `scrollIntoView`, which also moves the page).
  function scrollToBottom() {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight })
    atBottom.current = true
    setHasNew(false)
  }
  const count = (messages?.length ?? 0) + pending.length
  useEffect(() => {
    if (count === 0) return
    if (atBottom.current) scrollToBottom()
    else if (count > seen.current) setHasNew(true)
    seen.current = count
  }, [count])
  function onScroll() {
    const el = scroller.current
    if (!el) return
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    if (atBottom.current) setHasNew(false)
  }

  async function deliver(item: Pending) {
    try {
      const sent = unwrap(
        await apiClient.POST('/api/v1/conversations/{id}/messages', {
          params: { path: { id: conversationId } },
          body: { text: item.body },
        }),
      )
      // The stored message takes the place of the optimistic one without a gap or a flicker.
      qc.setQueryData<ThreadMessageData[]>(inboxKeys.thread(orgId, conversationId), (old) =>
        !old || old.some((m) => m.id === sent.id) ? old : [...old, sent],
      )
      setPending((p) => p.filter((x) => x.tempId !== item.tempId))
      void Promise.all([
        qc.invalidateQueries({ queryKey: inboxKeys.detail(orgId, conversationId) }),
        qc.invalidateQueries({ queryKey: [...inboxKeys.all(orgId), 'list'] }),
        qc.invalidateQueries({ queryKey: [...inboxKeys.all(orgId), 'counts'] }),
      ])
    } catch (error) {
      setPending((p) =>
        p.map((x) =>
          x.tempId === item.tempId ? { ...x, status: 'FAILED', error: errorText(all, error) } : x,
        ),
      )
    }
  }
  function submit(body: string) {
    const item: Pending = {
      tempId: crypto.randomUUID(),
      body,
      createdAt: new Date().toISOString(),
      status: 'SENDING',
    }
    atBottom.current = true
    setPending((p) => [...p, item])
    void deliver(item)
  }
  function retryPending(item: Pending) {
    const again: Pending = { ...item, status: 'SENDING' }
    delete again.error
    setPending((p) => p.map((x) => (x.tempId === item.tempId ? again : x)))
    void deliver(again)
  }
  function onSubmit(e?: FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body) return
    changeDraft('')
    submit(body)
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onSubmit()
    }
  }

  const entries: Entry[] = [
    ...(messages ?? []).map((m): Entry => ({
      key: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt,
      status: m.direction === 'OUTBOUND' ? m.deliveryStatus : 'READ',
      sentFromDevice: m.sentFromDevice,
      // A send the provider rejected is stored as failed: sending the same text again is a new message.
      ...(m.direction === 'OUTBOUND' && m.deliveryStatus === 'FAILED' && detail.canReply
        ? { onRetry: () => submit(m.body) }
        : {}),
    })),
    ...pending.map((p): Entry => ({
      key: p.tempId,
      direction: 'OUTBOUND',
      body: p.body,
      createdAt: p.createdAt,
      status: p.status,
      sentFromDevice: false,
      ...(p.error ? { error: p.error } : {}),
      ...(p.status === 'FAILED' ? { onRetry: () => retryPending(p) } : {}),
    })),
  ]

  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  const dayLabel = (d: Date) =>
    dayKey(d) === dayKey(today)
      ? c('today')
      : dayKey(d) === dayKey(yesterday)
        ? c('yesterday')
        : format.dateTime(d, { dateStyle: 'long' })

  // Reference delegate: who attends the contact now, when it is not the owner of this number.
  const reference =
    detail.referenceDelegateId && detail.referenceDelegateId !== detail.account.delegateId
      ? detail.referenceDelegateName
      : null
  const owner = detail.account.delegateName
  const iAmOwner = myMemberId === detail.account.delegateId
  const expires = detail.serviceWindow.expiresAt ? new Date(detail.serviceWindow.expiresAt) : null

  let lastDay = ''
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {reference ? (
        <div className="px-4 pt-3">
          <Callout variant="info">
            {iAmOwner
              ? c('redirect', { name: reference })
              : detail.referenceDelegateId === myMemberId
                ? c('attendedByYou', { owner })
                : c('attendedBy', { name: reference, owner })}
          </Callout>
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-3">
          <div role="log" aria-live={live ? 'polite' : 'off'} aria-label={t('title')}>
            {thread.isPending ? (
              <div className="space-y-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-10 w-3/5 animate-pulse rounded-lg bg-surface-200',
                      i % 2 ? 'ml-auto' : '',
                    )}
                  />
                ))}
              </div>
            ) : thread.error ? (
              <Callout variant="destructive">
                {errorText(all, thread.error)}{' '}
                <button type="button" className="underline" onClick={() => void thread.refetch()}>
                  {c('retry')}
                </button>
              </Callout>
            ) : entries.length === 0 ? (
              <EmptyState title={c('empty')} />
            ) : (
              <ul className="space-y-1">
                {entries.map((m) => {
                  const when = new Date(m.createdAt)
                  const separator = dayKey(when) !== lastDay ? dayLabel(when) : null
                  lastDay = dayKey(when)
                  const out = m.direction === 'OUTBOUND'
                  return (
                    <li key={m.key}>
                      {separator ? (
                        <div
                          role="separator"
                          className="my-3 flex items-center gap-2 text-xs text-foreground-lighter"
                        >
                          <span className="h-px flex-1 bg-border" />
                          {separator}
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      ) : null}
                      <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                            out
                              ? 'bg-brand-subtle text-foreground'
                              : 'border border-border bg-background text-foreground',
                            m.status === 'SENDING' && 'opacity-70',
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-foreground-lighter">
                            {m.sentFromDevice ? <span>{c('fromDevice')} ·</span> : null}
                            <time dateTime={m.createdAt}>
                              {format.dateTime(when, { timeStyle: 'short' })}
                            </time>
                            {out ? <DeliveryTicks status={m.status} /> : null}
                          </p>
                          {m.status === 'FAILED' ? (
                            <p role="alert" className="mt-1 text-xs text-destructive">
                              {c('notSent')}
                              {m.error ? `: ${m.error}` : ''}{' '}
                              {m.onRetry ? (
                                <button type="button" className="underline" onClick={m.onRetry}>
                                  {c('retry')}
                                </button>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
        {hasNew ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <Button size="tiny" className="pointer-events-auto shadow-md" onClick={scrollToBottom}>
              <ArrowDown className="size-3.5" aria-hidden />
              {c('newMessages')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border p-3">
        {detail.canReply ? (
          <form onSubmit={onSubmit} className="space-y-2">
            {expires && detail.serviceWindow.status === 'OPEN' ? (
              <p className="text-xs text-foreground-lighter">
                {c('windowOpen', {
                  date: format.dateTime(expires, { dateStyle: 'medium', timeStyle: 'short' }),
                })}
              </p>
            ) : null}
            <Textarea
              ref={composer}
              aria-label={c('composerLabel')}
              placeholder={c('placeholder')}
              rows={1}
              maxLength={4096}
              value={draft}
              onChange={(e) => changeDraft(e.target.value)}
              onKeyDown={onKeyDown}
              className="resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-foreground-lighter">{c('composerHint')}</p>
              <Button type="submit" variant="primary" size="small" disabled={!draft.trim()}>
                <Send className="size-4" aria-hidden />
                {c('send')}
              </Button>
            </div>
          </form>
        ) : !connected ? (
          <Callout variant="info">{c('notConnected')}</Callout>
        ) : closed && iAmOwner ? (
          <Callout variant="warning">{c('windowClosed')}</Callout>
        ) : (
          <Callout variant="info">{c('readOnly', { name: owner })}</Callout>
        )}
      </div>
    </div>
  )
}
