'use client'

import { Badge, Button, Callout, cn, EmptyState } from '@saas/ui'
import { MessageSquareOff, PanelRightClose, PanelRightOpen, X } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, type KeyboardEvent } from 'react'
import { ApiError, errorText } from '@/client/errors.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { ContactFicha } from './contact-ficha.tsx'
import { ConversationChat } from './conversation-chat.tsx'
import { useConversation } from './queries.ts'

/**
 * One panel with two columns: the chat and the contact's ficha (read only). From `xl` both sit side
 * by side and the ficha can be folded (the preference is remembered by the caller); below that the
 * panel takes the whole width and the ficha becomes a second tab. Mounted once per conversation
 * (`key`), so the tab and the draft state belong to it.
 */
export function ConversationPanel({
  conversationId,
  fichaCollapsed,
  onToggleFicha,
  onClose,
  onOpenConversation,
}: {
  conversationId: string
  fichaCollapsed: boolean
  onToggleFicha: () => void
  onClose: () => void
  onOpenConversation: (id: string) => void
}) {
  const t = useTranslations('inbox')
  const c = useTranslations('inbox.conversation')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const conversation = useConversation(orgId, conversationId)
  const [tab, setTab] = useState<'chat' | 'ficha'>('chat')
  const d = conversation.data

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      onClose()
    }
  }

  const closeButton = (
    <Button size="small" variant="ghost" aria-label={c('close')} onClick={onClose}>
      <X aria-hidden />
    </Button>
  )

  if (conversation.error) {
    // Not visible and not existing look the same on purpose (404).
    const missing = conversation.error instanceof ApiError && conversation.error.status === 404
    return (
      <section aria-label={t('title')} className="flex h-full flex-col" onKeyDown={onKeyDown}>
        <div className="flex justify-end border-b border-border p-2">{closeButton}</div>
        <div className="p-6">
          {missing ? (
            <EmptyState
              icon={<MessageSquareOff />}
              title={t('notFound')}
              action={<Button onClick={onClose}>{t('back')}</Button>}
            />
          ) : (
            <Callout variant="destructive">
              {errorText(all, conversation.error)}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => void conversation.refetch()}
              >
                {c('retry')}
              </button>
            </Callout>
          )}
        </div>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="conversation-title"
      className="flex h-full min-h-0 flex-col"
      onKeyDown={onKeyDown}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          {d ? (
            <>
              <h2 id="conversation-title" className="flex flex-wrap items-center gap-2 text-base">
                <Link href={`/contacts/${d.contact.id}`} className="truncate hover:underline">
                  {d.contact.name}
                </Link>
                {d.contact.isUnassigned ? (
                  <Badge variant="warning">{t('row.unassigned')}</Badge>
                ) : null}
                <Badge>{d.channel}</Badge>
              </h2>
              <p className="truncate text-xs text-foreground-lighter">
                {[d.contact.phone, c('account', { name: d.account.delegateName })]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </>
          ) : (
            <div className="space-y-2" aria-hidden>
              <div className="h-5 w-40 animate-pulse rounded bg-surface-200" />
              <div className="h-3 w-56 animate-pulse rounded bg-surface-200" />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="small"
            variant="ghost"
            aria-pressed={!fichaCollapsed}
            aria-label={fichaCollapsed ? c('showFicha') : c('hideFicha')}
            title={fichaCollapsed ? c('showFicha') : c('hideFicha')}
            className="hidden xl:inline-flex"
            onClick={onToggleFicha}
          >
            {fichaCollapsed ? <PanelRightOpen aria-hidden /> : <PanelRightClose aria-hidden />}
          </Button>
          {closeButton}
        </div>
      </header>

      {/* Below xl the ficha is a second tab of the same panel. */}
      <div
        role="tablist"
        aria-label={c('tabs.label')}
        className="flex gap-1 border-b border-border px-4 py-2 xl:hidden"
      >
        {(['chat', 'ficha'] as const).map((id) => (
          <Button
            key={id}
            role="tab"
            size="tiny"
            variant={tab === id ? 'primary' : 'ghost'}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {c(`tabs.${id}`)}
          </Button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={cn('min-w-0 flex-1 flex-col', tab === 'chat' ? 'flex' : 'hidden xl:flex')}>
          {d ? (
            <ConversationChat key={conversationId} conversationId={conversationId} detail={d} />
          ) : null}
        </div>
        {d ? (
          <ContactFicha
            conversationId={conversationId}
            contactId={d.contact.id}
            channel={d.channel}
            onOpenConversation={onOpenConversation}
            className={cn(
              'w-full xl:w-80 xl:shrink-0 xl:border-l xl:border-border',
              tab === 'ficha' ? 'block' : 'hidden',
              fichaCollapsed ? 'xl:hidden' : 'xl:block',
            )}
          />
        ) : null}
      </div>
    </section>
  )
}
