'use client'

import {
  Badge,
  Button,
  Callout,
  Checkbox,
  EmptyState,
  Field,
  Select,
  SidePanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { useCan, useMemberId, useOrganizationId } from '@/components/workspace-context.tsx'
import { ContactFields, readContactForm } from './contact-fields.tsx'
import { contactKeys, useAssignableMembers, useContacts } from './queries.ts'

/** Contacts the person may see: all of them for administrators, their own for delegates. */
export function ContactsList() {
  const t = useTranslations('contacts')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const canWrite = useCan()('contacts.write')
  const contacts = useContacts(orgId)
  const [creating, setCreating] = useState(false)
  const items = contacts.data ?? []

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite ? (
            <Button variant="primary" size="small" onClick={() => setCreating(true)}>
              <Plus /> {t('new')}
            </Button>
          ) : null
        }
      />
      <PageContainer>
        {contacts.error ? (
          <Callout variant="destructive">{errorText(all, contacts.error)}</Callout>
        ) : null}
        {items.length === 0 && !contacts.isPending ? (
          <EmptyState
            icon={<Users />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.name')}</TH>
                <TH>{t('columns.phone')}</TH>
                <TH>{t('columns.email')}</TH>
                <TH>{t('columns.delegate')}</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/contacts/${c.id}`} className="text-foreground hover:underline">
                      {c.name}
                    </Link>
                    {c.isUnassigned ? (
                      <Badge variant="warning" className="ml-2">
                        {t('pendingIdentification')}
                      </Badge>
                    ) : null}
                  </TD>
                  <TD className="text-foreground-lighter">{c.phone ?? '—'}</TD>
                  <TD className="text-foreground-lighter">{c.email ?? '—'}</TD>
                  <TD className="text-foreground-lighter">
                    {c.referenceDelegate?.name ?? t('unassigned')}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </PageContainer>
      {creating ? <NewContactPanel onClose={() => setCreating(false)} /> : null}
    </>
  )
}

function NewContactPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('contacts')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const formId = 'new-contact-form'
  const canAssign = useCan()('contacts.assign')
  const me = useMemberId()
  // Only whoever may assign someone else reads the member list.
  const candidates = useAssignableMembers(orgId, canAssign).data ?? []
  const [email, setEmail] = useState('')
  const create = useMutation({
    mutationFn: async (
      body: ReturnType<typeof readContactForm> & { delegateId?: string; sendWelcome: boolean },
    ) => unwrap(await apiClient.POST('/api/v1/contacts', { body })),
    onSuccess: async (_c, body) => {
      await qc.invalidateQueries({ queryKey: contactKeys.all(orgId) })
      if (body.sendWelcome) toast.success(t('welcome.queued'))
      onClose()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const delegateId = field(form, 'delegateId')
    create.mutate({
      ...readContactForm(form),
      ...(delegateId ? { delegateId } : {}),
      sendWelcome: form.get('sendWelcome') === 'on',
    })
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('newTitle')}
      closeLabel={all('shell.close')}
      footer={
        <>
          <Button onClick={onClose}>{all('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" disabled={create.isPending}>
            {t('create')}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-6" onSubmit={onSubmit}>
        {create.error ? (
          <Callout variant="destructive">{errorText(all, create.error)}</Callout>
        ) : null}
        <div
          onChange={(e) => {
            const target = e.target as HTMLInputElement
            if (target.name === 'email') setEmail(target.value.trim())
          }}
        >
          <ContactFields autoFocus />
        </div>
        {canAssign && candidates.length > 0 ? (
          <Field label={t('delegate.title')}>
            {(p) => (
              <Select {...p} name="delegateId" defaultValue={me ?? undefined}>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Checkbox
          name="sendWelcome"
          disabled={!email}
          label={t('welcome.onCreate')}
          description={email ? t('welcome.onCreateHint') : t('welcome.needsEmail')}
        />
      </form>
    </SidePanel>
  )
}
