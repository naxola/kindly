'use client'

import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  Field,
  Input,
  Panel,
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
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { intakeKeys, useIntegrationKeys } from './queries.ts'

/**
 * Integrations (administrators): the keys an automation (n8n) uses to send altas to this
 * organization. A key is shown only once, when it is created; afterwards only its first
 * characters, to recognize it.
 */
export function IntegrationsScreen() {
  const t = useTranslations('integrations')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const keys = useIntegrationKeys(orgId)
  const [token, setToken] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null)
  const endpoint =
    typeof window === 'undefined'
      ? '/api/integrations/affiliate-requests'
      : `${window.location.origin}/api/integrations/affiliate-requests`

  const create = useMutation({
    mutationFn: async (name: string) =>
      unwrap(await apiClient.POST('/api/v1/integration-keys', { body: { name } })),
    onSuccess: async (created) => {
      setToken(created.token)
      await qc.invalidateQueries({ queryKey: intakeKeys.keys(orgId) })
    },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await apiClient.POST('/api/v1/integration-keys/{id}/revoke', { params: { path: { id } } }),
      ),
    onSuccess: () => toast.success(t('revoked')),
    onSettled: async () => {
      setRevoking(null)
      await qc.invalidateQueries({ queryKey: intakeKeys.keys(orgId) })
    },
  })
  const error = keys.error ?? create.error ?? revoke.error
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    create.mutate(field(new FormData(form), 'name').trim(), { onSuccess: () => form.reset() })
  }

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <PageContainer size="medium" className="space-y-6">
        {error ? <Callout variant="destructive">{errorText(all, error)}</Callout> : null}
        <Panel title={t('intakeTitle')} description={t('intakeDescription')}>
          <div className="space-y-4 p-4">
            <p className="text-sm text-foreground-light">
              {t('endpoint')}:{' '}
              <code className="font-mono break-all text-foreground">POST {endpoint}</code>
            </p>
            <p className="text-sm text-foreground-light">{t('authHint')}</p>
            {token ? (
              <Callout variant="warning">
                <p className="mb-2">{t('tokenOnce')}</p>
                <code className="block font-mono break-all text-foreground">{token}</code>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="small"
                    onClick={() => {
                      void navigator.clipboard.writeText(token)
                      toast.success(t('copied'))
                    }}
                  >
                    {t('copy')}
                  </Button>
                  <Button size="small" onClick={() => setToken(null)}>
                    {t('saved')}
                  </Button>
                </div>
              </Callout>
            ) : null}
            <form className="flex flex-wrap items-end gap-3" onSubmit={onSubmit}>
              <Field label={t('name')} className="min-w-48 flex-1">
                {(p) => <Input {...p} name="name" required maxLength={80} placeholder="n8n" />}
              </Field>
              <Button type="submit" variant="primary" disabled={create.isPending}>
                {t('create')}
              </Button>
            </form>
          </div>
        </Panel>

        {(keys.data ?? []).length > 0 ? (
          <Table>
            <THead>
              <tr>
                <TH>{t('columns.name')}</TH>
                <TH>{t('columns.key')}</TH>
                <TH>{t('columns.created')}</TH>
                <TH>{t('columns.lastUsed')}</TH>
                <TH>
                  <span className="sr-only">{t('columns.actions')}</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {(keys.data ?? []).map((k) => (
                <TR key={k.id}>
                  <TD>{k.name}</TD>
                  <TD className="font-mono text-foreground-lighter">{k.keyPrefix}…</TD>
                  <TD className="text-foreground-lighter">{date(k.createdAt)}</TD>
                  <TD className="text-foreground-lighter">
                    {k.lastUsedAt ? date(k.lastUsedAt) : t('neverUsed')}
                  </TD>
                  <TD className="text-right">
                    {k.revokedAt ? (
                      <Badge>{t('revokedBadge')}</Badge>
                    ) : (
                      <Button
                        size="small"
                        aria-label={t('revokeFor', { name: k.name })}
                        onClick={() => setRevoking({ id: k.id, name: k.name })}
                      >
                        {t('revoke')}
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : null}
      </PageContainer>
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={t('revokeTitle')}
        description={revoking ? t('revokeDescription', { name: revoking.name }) : undefined}
        confirmLabel={t('revoke')}
        cancelLabel={all('common.cancel')}
        variant="destructive"
        loading={revoke.isPending}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking.id)
        }}
      />
    </>
  )
}
