'use client'

import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  Field,
  Input,
  SidePanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { keys, usePositions } from '@/client/queries.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'

type Position = NonNullable<ReturnType<typeof usePositions>['data']>[number]

/**
 * Positions (cargos) of the organization: a catalog of names with no behaviour. Everyone sees
 * the list; only whoever has `positions.manage` can change it.
 */
export function PositionsSettings() {
  const t = useTranslations()
  const orgId = useOrganizationId()
  const canManage = useCan()('positions.manage')
  const qc = useQueryClient()
  const positions = usePositions(orgId, true)
  const [editing, setEditing] = useState<Position | 'new' | null>(null)
  const [archiving, setArchiving] = useState<Position | null>(null)
  // Names show on the members list too.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.positions(orgId) }),
      qc.invalidateQueries({ queryKey: keys.members(orgId) }),
    ])

  const archive = useMutation({
    mutationFn: async (p: Position) =>
      unwrap(
        await apiClient.POST(
          p.archived ? '/api/v1/positions/{id}/restore' : '/api/v1/positions/{id}/archive',
          { params: { path: { id: p.id } } },
        ),
      ),
    onSuccess: async () => {
      setArchiving(null)
      await refresh()
    },
  })
  const items = positions.data ?? []

  return (
    <>
      <PageHeader
        title={t('settings.positions.title')}
        description={t('settings.positions.description')}
        actions={
          canManage ? (
            <Button variant="primary" size="small" onClick={() => setEditing('new')}>
              <Plus /> {t('settings.positions.add')}
            </Button>
          ) : null
        }
      />
      <PageContainer className="space-y-6">
        {archive.error ? (
          <Callout variant="destructive">{errorText(t, archive.error)}</Callout>
        ) : null}
        {items.length === 0 && !positions.isPending ? (
          <p className="text-sm text-foreground-lighter">{t('settings.positions.empty')}</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t('settings.positions.name')}</TH>
                <TH>{t('settings.positions.status')}</TH>
                <TH>
                  <span className="sr-only">{t('common.actions')}</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {items.map((p) => (
                <TR key={p.id}>
                  <TD>{p.name}</TD>
                  <TD>
                    <Badge variant={p.archived ? 'warning' : 'success'}>
                      {p.archived
                        ? t('settings.positions.archived')
                        : t('settings.positions.active')}
                    </Badge>
                  </TD>
                  <TD className="text-right">
                    {canManage ? (
                      <>
                        <Button size="tiny" variant="ghost" onClick={() => setEditing(p)}>
                          {t('settings.positions.rename')}
                        </Button>
                        <Button
                          size="tiny"
                          variant="ghost"
                          disabled={archive.isPending}
                          onClick={() => (p.archived ? archive.mutate(p) : setArchiving(p))}
                        >
                          {p.archived
                            ? t('settings.positions.restore')
                            : t('settings.positions.archive')}
                        </Button>
                      </>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </PageContainer>
      {editing ? (
        <PositionPanel
          position={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={t('settings.positions.archive')}
        description={t('settings.positions.archiveDescription', { name: archiving?.name ?? '' })}
        confirmLabel={t('settings.positions.archive')}
        cancelLabel={t('common.cancel')}
        variant="destructive"
        loading={archive.isPending}
        onConfirm={() => {
          if (archiving) archive.mutate(archiving)
        }}
      />
    </>
  )
}

function PositionPanel({
  position,
  onClose,
  onSaved,
}: {
  position: Position | null
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const t = useTranslations()
  const formId = 'position-form'
  const save = useMutation({
    mutationFn: async (name: string) =>
      position
        ? unwrap(
            await apiClient.PUT('/api/v1/positions/{id}', {
              params: { path: { id: position.id } },
              body: { name },
            }),
          )
        : unwrap(await apiClient.POST('/api/v1/positions', { body: { name } })),
    onSuccess: async () => {
      await onSaved()
      onClose()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    save.mutate(field(new FormData(e.currentTarget), 'name').trim())
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={position ? t('settings.positions.renameTitle') : t('settings.positions.createTitle')}
      closeLabel={t('shell.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" disabled={save.isPending}>
            {t('settings.positions.save')}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-6" onSubmit={onSubmit}>
        {save.error ? <Callout variant="destructive">{errorText(t, save.error)}</Callout> : null}
        <Field label={t('settings.positions.name')}>
          {(p) => (
            <Input
              {...p}
              name="name"
              required
              maxLength={60}
              autoFocus
              defaultValue={position?.name ?? ''}
            />
          )}
        </Field>
      </form>
    </SidePanel>
  )
}
