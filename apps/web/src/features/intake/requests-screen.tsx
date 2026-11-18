'use client'

import {
  Button,
  Callout,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Panel,
  Select,
  SidePanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  toast,
  TR,
} from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { contactKeys } from '@/features/contacts/queries.ts'
import {
  intakeKeys,
  useAffiliateRequests,
  type AffiliateRequest,
  type DelegateLoad,
} from './queries.ts'

/**
 * Altas received from the automation (administrators): the pending ones with the proposed
 * delegate, and the possible duplicates. Each alta is reviewed in a side panel with the delegates
 * and their load; nothing is assigned until an administrator confirms it.
 */
export function RequestsScreen() {
  const t = useTranslations('intake')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const requests = useAffiliateRequests(orgId)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [confirmingAll, setConfirmingAll] = useState(false)
  const pending = requests.data?.pending ?? []
  const duplicates = requests.data?.duplicates ?? []
  const withProposal = pending.filter((r) => r.proposedDelegate).length
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: intakeKeys.all(orgId) }),
      qc.invalidateQueries({ queryKey: contactKeys.all(orgId) }),
    ])

  const confirmAll = useMutation({
    mutationFn: async () => unwrap(await apiClient.POST('/api/v1/affiliate-requests/confirm-all')),
    onSuccess: (r) => toast.success(t('toasts.confirmedAll', { count: r.confirmed })),
    onSettled: async () => {
      setConfirmingAll(false)
      await refresh()
    },
  })
  const apply = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await apiClient.POST('/api/v1/affiliate-requests/{id}/apply', {
          params: { path: { id } },
        }),
      ),
    onSuccess: () => toast.success(t('toasts.applied')),
    onSettled: refresh,
  })
  const discard = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await apiClient.POST('/api/v1/affiliate-requests/{id}/discard', {
          params: { path: { id } },
        }),
      ),
    onSuccess: () => toast.success(t('toasts.discarded')),
    onSettled: refresh,
  })
  const error = requests.error ?? confirmAll.error ?? apply.error ?? discard.error
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' })
  const name = (r: AffiliateRequest) => `${r.data.firstName} ${r.data.lastName}`
  const current = pending.find((r) => r.id === reviewing)

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button asChild>
              <Link href="/contacts">{t('backToContacts')}</Link>
            </Button>
            {withProposal > 0 ? (
              <Button variant="primary" onClick={() => setConfirmingAll(true)}>
                {t('confirmAll')}
              </Button>
            ) : null}
          </>
        }
      />
      <PageContainer className="space-y-8">
        {error ? <Callout variant="destructive">{errorText(all, error)}</Callout> : null}
        {pending.length === 0 && duplicates.length === 0 && !requests.isPending ? (
          <EmptyState
            icon={<Inbox />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        ) : null}

        {pending.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-base">{t('pendingTitle', { count: pending.length })}</h2>
            <Table>
              <THead>
                <tr>
                  <TH>{t('columns.name')}</TH>
                  <TH>{t('columns.dni')}</TH>
                  <TH>{t('columns.received')}</TH>
                  <TH>{t('columns.proposal')}</TH>
                  <TH>
                    <span className="sr-only">{t('columns.actions')}</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {pending.map((r) => (
                  <TR key={r.id}>
                    <TD>{name(r)}</TD>
                    <TD className="text-foreground-lighter">{r.data.dni}</TD>
                    <TD className="text-foreground-lighter">{date(r.receivedAt)}</TD>
                    <TD className="text-foreground-lighter">
                      {r.proposedDelegate?.name ?? t('noProposal')}
                    </TD>
                    <TD className="text-right">
                      <Button
                        size="small"
                        aria-label={t('reviewFor', { name: name(r) })}
                        onClick={() => setReviewing(r.id)}
                      >
                        {t('review')}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>
        ) : null}

        {duplicates.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-base">{t('duplicatesTitle', { count: duplicates.length })}</h2>
            <p className="text-sm text-foreground-lighter">{t('duplicatesHint')}</p>
            <Table>
              <THead>
                <tr>
                  <TH>{t('columns.name')}</TH>
                  <TH>{t('columns.dni')}</TH>
                  <TH>{t('columns.existing')}</TH>
                  <TH>{t('columns.received')}</TH>
                  <TH>
                    <span className="sr-only">{t('columns.actions')}</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {duplicates.map((r) => (
                  <TR key={r.id}>
                    <TD>{name(r)}</TD>
                    <TD className="text-foreground-lighter">{r.data.dni}</TD>
                    <TD>
                      {r.duplicateOf ? (
                        <Link
                          href={`/contacts/${r.duplicateOf.contactId}`}
                          className="text-foreground hover:underline"
                        >
                          {r.duplicateOf.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD className="text-foreground-lighter">{date(r.receivedAt)}</TD>
                    <TD className="space-x-2 text-right whitespace-nowrap">
                      <Button
                        size="small"
                        disabled={apply.isPending}
                        aria-label={t('applyFor', { name: name(r) })}
                        onClick={() => apply.mutate(r.id)}
                      >
                        {t('apply')}
                      </Button>
                      <Button
                        size="small"
                        disabled={discard.isPending}
                        aria-label={t('discardFor', { name: name(r) })}
                        onClick={() => discard.mutate(r.id)}
                      >
                        {t('discard')}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </section>
        ) : null}
      </PageContainer>

      {current ? (
        <ReviewPanel
          request={current}
          delegates={requests.data?.delegates ?? []}
          onClose={() => setReviewing(null)}
          onDone={refresh}
        />
      ) : null}
      <ConfirmDialog
        open={confirmingAll}
        onOpenChange={setConfirmingAll}
        title={t('confirmAllTitle')}
        description={t('confirmAllDescription', { count: withProposal })}
        confirmLabel={t('confirmAll')}
        cancelLabel={all('common.cancel')}
        loading={confirmAll.isPending}
        onConfirm={() => confirmAll.mutate()}
      />
    </>
  )
}

function ReviewPanel({
  request: r,
  delegates,
  onClose,
  onDone,
}: {
  request: AffiliateRequest
  delegates: DelegateLoad[]
  onClose: () => void
  onDone: () => Promise<unknown>
}) {
  const t = useTranslations('intake')
  const all = useTranslations()
  const format = useFormatter()
  const [delegateId, setDelegateId] = useState(r.proposedDelegate?.memberId ?? '')
  const [notify, setNotify] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const name = `${r.data.firstName} ${r.data.lastName}`

  const confirm = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/affiliate-requests/{id}/confirm', {
          params: { path: { id: r.id } },
          body: { delegateId, notifyContact: notify },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('toasts.confirmed', { name }))
      await onDone()
      onClose()
    },
  })
  const discard = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/affiliate-requests/{id}/discard', {
          params: { path: { id: r.id } },
        }),
      ),
    onSuccess: async () => {
      toast.success(t('toasts.discarded'))
      await onDone()
      onClose()
    },
  })
  const error = confirm.error ?? discard.error
  const d = r.data
  const address = [
    [d.address.streetType, d.address.street, d.address.number].filter(Boolean).join(' '),
    [d.address.staircase, d.address.floor, d.address.door].filter(Boolean).join(' '),
    [d.address.postalCode, d.address.city].filter(Boolean).join(' '),
    d.address.province,
    d.address.country,
  ]
    .filter(Boolean)
    .join(', ')
  const fee =
    d.monthlyFeeCents === null
      ? null
      : format.number(d.monthlyFeeCents / 100, { style: 'currency', currency: 'EUR' })
  const rows: [string, string | null][] = [
    [t('fields.dni'), d.dni],
    [
      t('fields.birthDate'),
      d.birthDate
        ? format.dateTime(new Date(`${d.birthDate}T00:00:00Z`), {
            dateStyle: 'long',
            timeZone: 'UTC',
          })
        : null,
    ],
    [t('fields.gender'), d.gender],
    [t('fields.phone'), d.phoneE164],
    [t('fields.email'), d.email],
    [t('fields.address'), address || null],
    [t('fields.province'), d.province],
    [t('fields.sector'), d.sector],
    [t('fields.employment'), d.employmentStatus],
    [t('fields.fee'), fee],
    [t('fields.workplace'), [d.workplace, d.workplaceProvince].filter(Boolean).join(', ') || null],
  ]

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={name}
      description={t('reviewDescription')}
      closeLabel={all('shell.close')}
      size="large"
      footer={
        <>
          <Button disabled={discard.isPending} onClick={() => setDiscarding(true)}>
            {t('discard')}
          </Button>
          <Button
            variant="primary"
            disabled={!delegateId || confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {error ? <Callout variant="destructive">{errorText(all, error)}</Callout> : null}
        <Panel title={t('receivedData')}>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 p-4 text-sm sm:grid-cols-[10rem_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-foreground-lighter">{label}</dt>
                <dd className="text-foreground">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title={t('delegatesTitle')} description={t('delegatesHint')}>
          {delegates.length === 0 ? (
            <p className="p-4 text-sm text-foreground-lighter">{t('noDelegates')}</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t('columns.delegate')}</TH>
                  <TH>{t('columns.assigned')}</TH>
                  <TH>{t('columns.pending')}</TH>
                  <TH>{t('columns.withThis')}</TH>
                </tr>
              </THead>
              <TBody>
                {delegates.map((m) => {
                  const mine = r.proposedDelegate?.memberId === m.memberId ? 1 : 0
                  const chosen = delegateId === m.memberId
                  const total = m.assigned + m.pending - mine + (chosen ? 1 : 0)
                  return (
                    <TR key={m.memberId}>
                      <TD>
                        {m.name}
                        {r.proposedDelegate?.memberId === m.memberId ? (
                          <span className="text-foreground-lighter"> · {t('proposed')}</span>
                        ) : null}
                      </TD>
                      <TD>{m.assigned}</TD>
                      <TD>{m.pending}</TD>
                      <TD>{total}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </Panel>
        <Field label={t('delegate')}>
          {(p) => (
            <Select {...p} value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
              <option value="" disabled>
                {t('chooseDelegate')}
              </option>
              {delegates.map((m) => (
                <option key={m.memberId} value={m.memberId}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Checkbox
          checked={notify}
          disabled={!d.email}
          onChange={(e) => setNotify(e.target.checked)}
          label={t('notify')}
          description={d.email ? t('notifyHint') : t('notifyNoEmail')}
        />
      </div>
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title={t('discardTitle')}
        description={t('discardDescription', { name })}
        confirmLabel={t('discard')}
        cancelLabel={all('common.cancel')}
        variant="destructive"
        loading={discard.isPending}
        onConfirm={() => discard.mutate()}
      />
    </SidePanel>
  )
}
