'use client'

import { Callout, ConfirmDialog, Select } from '@saas/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { useMembers } from '@/client/queries.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { contactKeys, useContactDelegates } from './queries.ts'

/**
 * Who answers for the contact, with the history of the previous ones. Administrators reassign
 * (with confirmation); everyone else only reads.
 */
export function DelegateSection({
  contactId,
  contactName,
  current,
}: {
  contactId: string
  contactName: string
  current: { memberId: string; name: string } | null
}) {
  const t = useTranslations('contacts.delegate')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const canAssign = useCan()('contacts.assign')
  const qc = useQueryClient()
  const history = useContactDelegates(orgId, contactId)
  // Only administrators can read the member list, and only they reassign.
  const members = useMembers(orgId)
  const [pending, setPending] = useState<string | null>(null)
  const candidates = (members.data ?? []).filter((m) => m.status === 'ACTIVE')
  const pendingName = candidates.find((m) => m.id === pending)?.displayName

  const reassign = useMutation({
    mutationFn: async (delegateId: string) =>
      unwrap(
        await apiClient.PUT('/api/v1/contacts/{id}/delegate', {
          params: { path: { id: contactId } },
          body: { delegateId },
        }),
      ),
    onSettled: async () => {
      setPending(null)
      await qc.invalidateQueries({ queryKey: contactKeys.all(orgId) })
    },
  })
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' })
  const rows = history.data ?? []

  return (
    <div className="space-y-3">
      {reassign.error ? (
        <Callout variant="destructive">{errorText(all, reassign.error)}</Callout>
      ) : null}
      {canAssign && current ? (
        <Select
          aria-label={t('select', { name: contactName })}
          value={pending ?? current.memberId}
          disabled={reassign.isPending}
          onChange={(e) => setPending(e.target.value)}
          className="w-64"
        >
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </Select>
      ) : current ? (
        <p className="text-sm text-foreground">{current.name}</p>
      ) : (
        <p className="text-sm text-foreground-lighter">{t('none')}</p>
      )}
      {rows.length > 1 ? (
        <ul className="space-y-1 border-t border-border pt-3 text-xs text-foreground-lighter">
          {rows.map((a) => (
            <li key={a.id}>
              {a.delegateName} —{' '}
              {a.endedAt
                ? t('range', { from: date(a.startedAt), to: date(a.endedAt) })
                : `${t('since', { from: date(a.startedAt) })} (${t('current')})`}
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmDialog
        open={pending !== null && pending !== current?.memberId}
        onOpenChange={(o) => !o && setPending(null)}
        title={t('confirmTitle')}
        description={
          pendingName
            ? t('confirmDescription', { delegate: pendingName, contact: contactName })
            : undefined
        }
        confirmLabel={t('confirm')}
        cancelLabel={all('common.cancel')}
        loading={reassign.isPending}
        onConfirm={() => {
          if (pending) reassign.mutate(pending)
        }}
      />
    </div>
  )
}
