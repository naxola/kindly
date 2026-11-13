'use client'

import { cn } from '@saas/ui'
import { PageHeader } from '@saas/ui/shell'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ConversationPanel } from './conversation-panel.tsx'
import { saveFichaCollapsed } from './ficha-preference.ts'
import { InboxList } from './inbox-list.tsx'

/**
 * The inbox screen: the list and, when a conversation is open, its panel beside it (chat + ficha).
 * The open conversation is `?conversation=<id>`, so it can be linked, reloaded and closed with Back.
 * From `xl` list and panel share the width; below it the panel replaces the list.
 */
export function InboxWorkspace({ initialFichaCollapsed }: { initialFichaCollapsed: boolean }) {
  const t = useTranslations('inbox')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const conversationId = params.get('conversation')
  const [fichaCollapsed, setFichaCollapsed] = useState(initialFichaCollapsed)

  const go = (id: string | null) => {
    const next = new URLSearchParams(params.toString())
    if (id) next.set('conversation', id)
    else next.delete('conversation')
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const toggleFicha = () => {
    setFichaCollapsed((collapsed) => {
      saveFichaCollapsed(!collapsed)
      return !collapsed
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="flex min-h-0 flex-1">
        <div
          data-f6
          aria-label={t('title')}
          className={cn('min-w-0 flex-1 overflow-y-auto', conversationId && 'hidden xl:block')}
        >
          <InboxList selectedId={conversationId} onOpen={go} />
        </div>
        {conversationId ? (
          <div
            className={cn(
              'min-h-0 w-full shrink-0 border-l border-border bg-background',
              fichaCollapsed ? 'xl:w-[26rem] 2xl:w-[34rem]' : 'xl:w-[46rem] 2xl:w-[56rem]',
            )}
          >
            <ConversationPanel
              key={conversationId}
              conversationId={conversationId}
              fichaCollapsed={fichaCollapsed}
              onToggleFicha={toggleFicha}
              onClose={() => go(null)}
              onOpenConversation={go}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
