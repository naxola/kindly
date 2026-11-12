'use client'

import { Button, Callout, EmptyState, Panel } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserX } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import type { FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { ApiError, errorText, unwrap } from '@/client/errors.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { ActivityFeed } from './activity-feed.tsx'
import { AffiliationSection } from './affiliation-section.tsx'
import { ContactFields, readContactForm } from './contact-fields.tsx'
import { DelegateSection } from './delegate-section.tsx'
import { contactKeys, useContact } from './queries.ts'

/** A contact: its data, who answers for it, its affiliation and its timeline. */
export function ContactDetail({ contactId }: { contactId: string }) {
  const t = useTranslations('contacts')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const canWrite = useCan()('contacts.write')
  const qc = useQueryClient()
  const contact = useContact(orgId, contactId)

  const save = useMutation({
    mutationFn: async (body: ReturnType<typeof readContactForm>) =>
      unwrap(
        await apiClient.PUT('/api/v1/contacts/{id}', { params: { path: { id: contactId } }, body }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all(orgId) }),
  })

  if (contact.error) {
    // Not visible and not existing look the same on purpose (404).
    const missing = contact.error instanceof ApiError && contact.error.status === 404
    return (
      <PageContainer>
        <EmptyState
          icon={<UserX />}
          title={missing ? t('notFound') : errorText(all, contact.error)}
          action={
            <Button asChild>
              <Link href="/contacts">{t('back')}</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  const c = contact.data
  if (!c) return null

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    save.mutate(readContactForm(new FormData(e.currentTarget)))
  }

  return (
    <>
      <PageHeader
        title={c.name}
        description={t('created', {
          date: format.dateTime(new Date(c.createdAt), { dateStyle: 'medium' }),
        })}
      />
      <PageContainer className="max-w-3xl space-y-6">
        <form onSubmit={onSubmit}>
          <Panel
            title={t('edit.title')}
            footer={
              canWrite ? (
                <Button type="submit" variant="primary" disabled={save.isPending}>
                  {t('save')}
                </Button>
              ) : null
            }
            className="space-y-4"
          >
            {save.error ? (
              <Callout variant="destructive">{errorText(all, save.error)}</Callout>
            ) : null}
            {/* Fresh defaults after each save or reload of the contact. */}
            <div key={c.updatedAt} className="space-y-4">
              <ContactFields contact={c} disabled={!canWrite} />
            </div>
          </Panel>
        </form>
        <Panel title={t('delegate.title')}>
          <DelegateSection contactId={c.id} contactName={c.name} current={c.referenceDelegate} />
        </Panel>
        <Panel title={t('affiliation.title')}>
          <AffiliationSection contactId={c.id} />
        </Panel>
        <Panel title={t('activity.title')}>
          <ActivityFeed contactId={c.id} />
        </Panel>
      </PageContainer>
    </>
  )
}
