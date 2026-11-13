'use client'

import { Badge, Callout, cn } from '@saas/ui'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { errorText } from '@/client/errors.ts'
import { useMembers } from '@/client/queries.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { AffiliationSummary } from '../contacts/affiliation-section.tsx'
import { UnidentifiedNotice } from '../contacts/unidentified-notice.tsx'
import { useContact, useContactAffiliation } from '../contacts/queries.ts'
import { useContactConversations, useContactOpenTasks } from './queries.ts'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-border px-4 py-4 first:border-t-0">
      <h3 className="text-xs font-medium uppercase tracking-wide text-foreground-lighter">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-foreground-lighter">{label}</dt>
      <dd className="min-w-0 truncate text-right text-foreground">{children}</dd>
    </div>
  )
}

/**
 * The contact's ficha next to the chat, **read only**: contact data, reference delegate,
 * affiliation (with its two fixed-rule notices), open tasks and the contact's other conversations.
 * Everything is edited in the contact's full page (`/contacts/[id]`). Cases are not shown: they are
 * not part of Kindly yet.
 */
export function ContactFicha({
  conversationId,
  contactId,
  channel,
  onOpenConversation,
  className,
}: {
  conversationId: string
  contactId: string
  channel: string
  onOpenConversation: (id: string) => void
  className?: string
}) {
  const t = useTranslations('inbox.ficha')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const contact = useContact(orgId, contactId)
  const affiliation = useContactAffiliation(orgId, contactId)
  const tasks = useContactOpenTasks(orgId, contactId)
  const others = useContactConversations(orgId, contactId)
  // Only administrators can read the member list; for the rest the delegate's name is left out.
  const members = useMembers(orgId)
  const names = new Map((members.data ?? []).map((m) => [m.id, m.displayName]))
  const otherConversations = (others.data ?? []).filter((c) => c.id !== conversationId)
  const c = contact.data

  return (
    <aside
      aria-label={t('title')}
      data-f6
      className={cn('overflow-y-auto bg-surface-100', className)}
    >
      {contact.error ? (
        <div className="p-4">
          <Callout variant="destructive">{errorText(all, contact.error)}</Callout>
        </div>
      ) : (
        <>
          <Section title={t('affiliation')}>
            {affiliation.isPending ? (
              <p className="text-sm text-foreground-lighter">…</p>
            ) : (
              <AffiliationSummary current={affiliation.data?.current ?? null} />
            )}
          </Section>

          <Section title={t('contact')}>
            {c ? (
              <>
                <dl className="space-y-1">
                  <Row label={t('phone')}>{c.phone ?? '—'}</Row>
                  <Row label={t('email')}>{c.email ?? '—'}</Row>
                  <Row label={t('channel')}>{channel}</Row>
                </dl>
                {c.isUnassigned ? <UnidentifiedNotice contactId={c.id} /> : null}
                {c.notes ? (
                  <p className="whitespace-pre-wrap text-xs text-foreground-lighter">{c.notes}</p>
                ) : null}
                <Link
                  href={`/contacts/${c.id}`}
                  className="inline-block text-xs text-brand hover:underline"
                >
                  {t('openFull')}
                </Link>
              </>
            ) : (
              <p className="text-sm text-foreground-lighter">…</p>
            )}
          </Section>

          <Section title={t('referenceDelegate')}>
            {c?.referenceDelegate ? (
              <p className="text-sm text-foreground">
                {c.referenceDelegate.name}
                <span className="block text-xs text-foreground-lighter">
                  {t('since', {
                    date: format.dateTime(new Date(c.referenceDelegate.since), {
                      dateStyle: 'medium',
                    }),
                  })}
                </span>
              </p>
            ) : (
              <p className="text-sm text-foreground-lighter">{t('noReference')}</p>
            )}
          </Section>

          <Section title={t('tasks')}>
            {(tasks.data ?? []).length === 0 && !tasks.isPending ? (
              <p className="text-sm text-foreground-lighter">{t('noTasks')}</p>
            ) : (
              <ul className="space-y-2">
                {(tasks.data ?? []).map((task) => (
                  <li key={task.id} className="flex items-start justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <Link href={`/tasks/${task.id}`} className="block truncate hover:underline">
                        {task.title}
                      </Link>
                      {task.conversationId === conversationId ? (
                        <Badge>{t('fromThisConversation')}</Badge>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-foreground-lighter">
                      {task.dueDate
                        ? format.dateTime(new Date(task.dueDate), {
                            dateStyle: 'medium',
                            timeZone: 'UTC',
                          })
                        : t('noDue')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('others')}>
            {otherConversations.length === 0 && !others.isPending ? (
              <p className="text-sm text-foreground-lighter">{t('noOthers')}</p>
            ) : (
              <ul className="space-y-2">
                {otherConversations.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/inbox?conversation=${o.id}`}
                      onClick={(e) => {
                        // Same panel, other conversation; a modified click still opens a new tab.
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
                          return
                        e.preventDefault()
                        onOpenConversation(o.id)
                      }}
                      className="block rounded-md px-2 py-1 text-sm hover:bg-surface-200"
                    >
                      <span className="block">
                        {o.channel}
                        {names.get(o.delegateId) ? ` · ${names.get(o.delegateId)}` : ''}
                      </span>
                      <span className="block truncate text-xs text-foreground-lighter">
                        {o.lastMessage?.body ?? t('noMessages')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </aside>
  )
}
