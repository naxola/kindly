'use client'

import { Badge, Button, Callout, ConfirmDialog, Field, Input } from '@saas/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { contactKeys, useContactAffiliation } from './queries.ts'

type Current = NonNullable<NonNullable<ReturnType<typeof useContactAffiliation>['data']>['current']>

/** First day of the month after `iso` (the first unpaid month), in UTC. */
const firstUnpaid = (iso: string) => {
  const d = new Date(iso)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
}

/**
 * Affiliation of the contact: status with its two fixed-rule notices (fee overdue, a good moment
 * to suggest rejoining; never an AI inference) and the form to register, edit, end or rejoin.
 * Whoever lacks `affiliations.manage` only reads.
 */
export function AffiliationSection({ contactId }: { contactId: string }) {
  const t = useTranslations('contacts.affiliation')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const canManage = useCan()('affiliations.manage')
  const qc = useQueryClient()
  const affiliation = useContactAffiliation(orgId, contactId)
  const [ending, setEnding] = useState(false)
  const current = affiliation.data?.current ?? null
  const active = current?.status === 'ACTIVE'

  const refresh = () => qc.invalidateQueries({ queryKey: contactKeys.all(orgId) })
  const save = useMutation({
    mutationFn: async (body: { memberNumber: string; startedAt: string; feePaidUntil: string }) => {
      const params = { params: { path: { id: contactId } }, body }
      return active
        ? unwrap(await apiClient.PUT('/api/v1/contacts/{id}/affiliation', params))
        : unwrap(await apiClient.POST('/api/v1/contacts/{id}/affiliation', params))
    },
    onSuccess: refresh,
  })
  const end = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/contacts/{id}/affiliation/end', {
          params: { path: { id: contactId } },
        }),
      ),
    onSettled: async () => {
      setEnding(false)
      await refresh()
    },
  })

  const day = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeZone: 'UTC' })
  const month = (d: Date | string) =>
    format.dateTime(new Date(d), { month: 'long', year: 'numeric', timeZone: 'UTC' })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    save.mutate({
      memberNumber: field(form, 'memberNumber').trim(),
      startedAt: field(form, 'startedAt'),
      feePaidUntil: field(form, 'feePaidUntil'),
    })
  }

  const error = save.error ?? end.error
  return (
    <div className="space-y-4">
      <Status current={current} day={day} month={month} />
      {error ? <Callout variant="destructive">{errorText(all, error)}</Callout> : null}
      {canManage ? (
        <form
          // A fresh form (and fresh defaults) whenever the period changes.
          key={`${current?.id ?? 'none'}-${current?.status ?? ''}`}
          className="max-w-sm space-y-4"
          onSubmit={onSubmit}
        >
          <Field label={t('number')}>
            {(p) => (
              <Input
                {...p}
                name="memberNumber"
                maxLength={40}
                defaultValue={current?.memberNumber ?? ''}
              />
            )}
          </Field>
          <Field label={active ? t('startedActive') : t('startedNew')}>
            {(p) => (
              <Input
                {...p}
                name="startedAt"
                type="date"
                required
                defaultValue={
                  active && current
                    ? current.startedAt.slice(0, 10)
                    : new Date().toISOString().slice(0, 10)
                }
              />
            )}
          </Field>
          <Field label={t('fee')} hint={t('feeHint')}>
            {(p) => (
              <Input
                {...p}
                name="feePaidUntil"
                type="month"
                defaultValue={current?.feePaidUntil?.slice(0, 7) ?? ''}
              />
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {active ? t('save') : current ? t('rejoin') : t('activate')}
            </Button>
            {active ? (
              <Button type="button" onClick={() => setEnding(true)}>
                {t('end')}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title={t('endTitle')}
        description={t('endDescription')}
        confirmLabel={t('end')}
        cancelLabel={all('common.cancel')}
        variant="destructive"
        loading={end.isPending}
        onConfirm={() => end.mutate()}
      />
    </div>
  )
}

function Status({
  current,
  day,
  month,
}: {
  current: Current | null
  day: (iso: string) => string
  month: (d: Date | string) => string
}) {
  const t = useTranslations('contacts.affiliation')
  if (!current) return <p className="text-sm text-foreground-lighter">{t('none')}</p>
  const number = current.memberNumber
    ? `${t('numberPrefix', { number: current.memberNumber })} · `
    : ''
  if (current.status === 'INACTIVE') {
    return (
      <div className="space-y-1">
        <Badge variant="warning">{t('ended')}</Badge>
        <p className="text-sm text-foreground-light">
          {number}
          {t('period', {
            from: day(current.startedAt),
            to: current.endedAt ? day(current.endedAt) : '—',
          })}
        </p>
        <p className="text-xs text-warning">{t('rejoinHint')}</p>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <Badge variant="success">{t('active')}</Badge>
      <p className="text-sm text-foreground-light">
        {number}
        {t('sinceDate', { date: day(current.startedAt) })}
      </p>
      {current.feePaidUntil && !current.feeOverdue ? (
        <p className="text-xs text-foreground-lighter">
          {t('feePaid', { month: month(current.feePaidUntil) })}
        </p>
      ) : null}
      {current.feePaidUntil && current.feeOverdue ? (
        <p className="text-xs text-warning">
          {t('feeOverdue', { month: month(firstUnpaid(current.feePaidUntil)) })}
        </p>
      ) : null}
    </div>
  )
}
