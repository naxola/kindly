'use client'

import { Button, Callout, ConfirmDialog, Field, Input, Panel, Select, toast } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { QueryError } from '@/components/query-error.tsx'
import { TableSkeleton } from '@/components/table-skeleton.tsx'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'

/**
 * Settings of the active organization: name and language (ADMIN), leaving it (anyone) and
 * archiving it (ADMIN, typing its name). The identifier (slug) never changes.
 */
export function OrganizationSettings() {
  const t = useTranslations()
  const orgId = useOrganizationId()
  const can = useCan()
  const current = useQuery({
    queryKey: ['org', orgId, 'current'],
    staleTime: 0,
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/organization')),
  })
  const organization = current.data?.organization

  return (
    <>
      <PageHeader
        title={t('settings.organization.title')}
        description={t('settings.organization.description')}
      />
      <PageContainer className="space-y-8">
        {current.isPending ? <TableSkeleton rows={2} label={t('states.loading')} /> : null}
        {current.isError ? (
          <QueryError error={current.error} onRetry={() => void current.refetch()} />
        ) : null}
        {organization ? (
          <>
            <GeneralForm
              key={`${organization.name}-${organization.defaultLocale}`}
              orgId={orgId}
              organization={organization}
              canEdit={can('organization.update')}
            />
            <LeavePanel />
            {can('organization.update') ? <ArchivePanel name={organization.name} /> : null}
          </>
        ) : null}
      </PageContainer>
    </>
  )
}

function GeneralForm({
  orgId,
  organization,
  canEdit,
}: {
  orgId: string
  organization: { name: string; slug: string; defaultLocale: 'es' | 'en' }
  canEdit: boolean
}) {
  const t = useTranslations()
  const router = useRouter()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: async (body: { name: string; defaultLocale: 'es' | 'en' }) =>
      unwrap(await apiClient.PATCH('/api/v1/organization', { body })),
    onSuccess: async () => {
      toast.success(t('toasts.organizationSaved'))
      await qc.invalidateQueries({ queryKey: ['org', orgId, 'current'] })
      router.refresh()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    save.mutate({
      name: field(form, 'name').trim(),
      defaultLocale: field(form, 'locale') === 'en' ? 'en' : 'es',
    })
  }

  return (
    <Panel title={t('settings.organization.general')}>
      <form className="max-w-md space-y-4" onSubmit={onSubmit}>
        {save.error ? <Callout variant="destructive">{errorText(t, save.error)}</Callout> : null}
        <Field label={t('settings.organization.name')}>
          {(p) => (
            <Input
              {...p}
              name="name"
              defaultValue={organization.name}
              required
              minLength={2}
              maxLength={120}
              readOnly={!canEdit}
              disabled={!canEdit}
            />
          )}
        </Field>
        <Field label={t('settings.organization.slug')} hint={t('settings.organization.slugHint')}>
          {(p) => <Input {...p} value={organization.slug} readOnly disabled />}
        </Field>
        <Field
          label={t('settings.organization.language')}
          hint={t('settings.organization.languageHint')}
        >
          {(p) => (
            <Select
              {...p}
              name="locale"
              defaultValue={organization.defaultLocale}
              disabled={!canEdit}
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </Select>
          )}
        </Field>
        {canEdit ? (
          <Button type="submit" size="small" variant="primary" disabled={save.isPending}>
            {t('settings.billing.save')}
          </Button>
        ) : null}
      </form>
    </Panel>
  )
}

function LeavePanel() {
  const t = useTranslations()
  const router = useRouter()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const leave = useMutation({
    mutationFn: async () => unwrap(await apiClient.POST('/api/v1/me/organization/leave')),
    onSuccess: () => {
      toast.success(t('toasts.left'))
      qc.clear()
      router.push('/')
      router.refresh()
    },
  })
  return (
    <Panel
      title={t('settings.organization.leave')}
      description={t('settings.organization.leaveHint')}
    >
      {leave.error ? (
        <Callout variant="destructive" className="mb-3">
          {errorText(t, leave.error)}
        </Callout>
      ) : null}
      <Button size="small" variant="destructive" onClick={() => setOpen(true)}>
        {t('settings.organization.leaveButton')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('settings.organization.leave')}
        description={t('settings.organization.leaveConfirm')}
        confirmLabel={t('settings.organization.leaveButton')}
        cancelLabel={t('common.cancel')}
        variant="destructive"
        loading={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
    </Panel>
  )
}

function ArchivePanel({ name }: { name: string }) {
  const t = useTranslations()
  const router = useRouter()
  const qc = useQueryClient()
  const [typed, setTyped] = useState('')
  const archive = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/organization/archive', { body: { confirmName: typed } }),
      ),
    onSuccess: () => {
      toast.success(t('toasts.archived'))
      qc.clear()
      router.push('/')
      router.refresh()
    },
  })
  return (
    <Panel
      title={t('settings.organization.archive')}
      description={t('settings.organization.archiveHint')}
    >
      <form
        className="max-w-md space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          archive.mutate()
        }}
      >
        {archive.error ? (
          <Callout variant="destructive">{errorText(t, archive.error)}</Callout>
        ) : null}
        <Field label={t('settings.organization.archiveType', { name })}>
          {(p) => (
            <Input
              {...p}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Button
          type="submit"
          size="small"
          variant="destructive"
          disabled={typed !== name || archive.isPending}
        >
          {t('settings.organization.archiveButton')}
        </Button>
      </form>
    </Panel>
  )
}
