'use client'

import { Button, Callout, Field, Input, Panel, toast } from '@saas/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import type { FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'

const DAY = 24 * 60 * 60 * 1000

/** Personal data and account deletion (ADR 0019): download first, delete with the password. */
export function PrivacyPanels() {
  return (
    <>
      <ExportPanel />
      <DeletionPanel />
    </>
  )
}

function ExportPanel() {
  const t = useTranslations()
  return (
    <Panel title={t('settings.account.export')} description={t('settings.account.exportHint')}>
      <Button asChild size="small" variant="default">
        {/* A plain link: the server answers with a download (Content-Disposition). */}
        <a href="/api/v1/me/export" download="personal-data.json">
          {t('settings.account.exportButton')}
        </a>
      </Button>
    </Panel>
  )
}

function DeletionPanel() {
  const t = useTranslations()
  const format = useFormatter()
  const qc = useQueryClient()
  const state = useQuery({
    queryKey: ['me', 'deletion'],
    staleTime: 0,
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/me/deletion')),
  })
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] })
  }
  const request = useMutation({
    mutationFn: async (password: string) =>
      unwrap(await apiClient.POST('/api/v1/me/deletion', { body: { password } })),
    onSuccess: async () => {
      toast.success(t('toasts.deletionRequested'))
      await refresh()
    },
    // The blockers may have changed since the screen loaded.
    onError: () => void refresh(),
  })
  const cancel = useMutation({
    mutationFn: async () => unwrap(await apiClient.DELETE('/api/v1/me/deletion')),
    onSuccess: async () => {
      toast.success(t('toasts.deletionCancelled'))
      await refresh()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    request.mutate(field(new FormData(e.currentTarget), 'password'))
  }

  const data = state.data
  const scheduled = data?.scheduledFor ? new Date(data.scheduledFor) : null
  const days = scheduled ? Math.max(0, Math.ceil((scheduled.getTime() - Date.now()) / DAY)) : 0

  return (
    <Panel title={t('settings.account.delete')} description={t('settings.account.deleteHint')}>
      {state.isError ? <Callout variant="destructive">{errorText(t, state.error)}</Callout> : null}
      {scheduled ? (
        <div className="max-w-md space-y-4">
          <Callout variant="warning" title={t('settings.account.deletePendingTitle')}>
            {t('settings.account.deletePending', {
              date: format.dateTime(scheduled, { dateStyle: 'long' }),
              days,
            })}
          </Callout>
          {cancel.error ? (
            <Callout variant="destructive">{errorText(t, cancel.error)}</Callout>
          ) : null}
          <Button
            size="small"
            variant="primary"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {t('settings.account.deleteCancel')}
          </Button>
        </div>
      ) : data ? (
        <form className="max-w-md space-y-4" onSubmit={onSubmit}>
          {data.blockers.length > 0 ? (
            <Callout variant="warning" title={t('settings.account.deleteBlockedTitle')}>
              <ul className="list-disc space-y-1 pl-4">
                {data.blockers.map((b) => (
                  <li key={`${b.code}:${b.organizationId}`}>
                    {t(`settings.account.deleteBlockers.${b.code}`, { name: b.organizationName })}
                  </li>
                ))}
              </ul>
            </Callout>
          ) : null}
          {data.archive.length > 0 ? (
            <Callout variant="info">
              {t('settings.account.deleteArchive', {
                names: data.archive.map((o) => o.name).join(', '),
              })}
            </Callout>
          ) : null}
          {request.error ? (
            <Callout variant="destructive">{errorText(t, request.error)}</Callout>
          ) : null}
          <Field label={t('settings.account.deletePassword')}>
            {(p) => (
              <Input
                {...p}
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                disabled={data.blockers.length > 0}
              />
            )}
          </Field>
          <Button
            type="submit"
            size="small"
            variant="destructive"
            disabled={request.isPending || data.blockers.length > 0}
          >
            {t('settings.account.deleteButton')}
          </Button>
        </form>
      ) : null}
    </Panel>
  )
}
