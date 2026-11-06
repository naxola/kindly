'use client'

import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  Field,
  Input,
  Select,
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
import { UserPlus } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { field } from '@/client/forms.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { keys, useInvitations, useMembers } from '@/client/queries.ts'
import { useCan, useMemberId, useOrganizationId } from '@/components/workspace-context.tsx'

type Member = NonNullable<ReturnType<typeof useMembers>['data']>[number]
type Role = 'ADMIN' | 'MEMBER'

export function MembersSettings() {
  const t = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const myMemberId = useMemberId()
  const can = useCan()
  const canManage = can('members.manage')
  const canInvite = can('members.invite')
  const qc = useQueryClient()
  const members = useMembers(orgId)
  const [inviting, setInviting] = useState(false)
  const [toggling, setToggling] = useState<Member | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: keys.members(orgId) })

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) =>
      unwrap(
        await apiClient.PUT('/api/v1/members/{id}/role', {
          params: { path: { id } },
          body: { role },
        }),
      ),
    onSettled: refresh,
  })
  const toggle = useMutation({
    mutationFn: async (m: Member) =>
      unwrap(
        await apiClient.PUT('/api/v1/members/{id}/status', {
          params: { path: { id: m.id } },
          body: { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' },
        }),
      ),
    onSuccess: async () => {
      setToggling(null)
      await refresh()
    },
  })
  const error = changeRole.error ?? toggle.error

  return (
    <>
      <PageHeader
        title={t('settings.members.title')}
        description={t('settings.members.description')}
        actions={
          canInvite ? (
            <Button variant="primary" size="small" onClick={() => setInviting(true)}>
              <UserPlus /> {t('settings.members.invite')}
            </Button>
          ) : null
        }
      />
      <PageContainer className="space-y-8">
        {error ? <Callout variant="destructive">{errorText(t, error)}</Callout> : null}
        <Table>
          <THead>
            <tr>
              <TH>{t('settings.members.name')}</TH>
              <TH>{t('settings.members.role')}</TH>
              <TH>{t('settings.members.status')}</TH>
              <TH>
                <span className="sr-only">{t('common.actions')}</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {(members.data ?? []).map((m) => (
              <TR key={m.id}>
                <TD>
                  <p>{m.displayName}</p>
                  <p className="text-xs text-foreground-lighter">{m.email ?? '—'}</p>
                </TD>
                <TD>
                  {canManage ? (
                    <Select
                      aria-label={t('settings.members.roleOf', { name: m.displayName })}
                      value={m.role}
                      disabled={changeRole.isPending}
                      onChange={(e) =>
                        changeRole.mutate({ id: m.id, role: e.target.value as Role })
                      }
                      className="w-36"
                    >
                      <option value="ADMIN">{t('roles.ADMIN')}</option>
                      <option value="MEMBER">{t('roles.MEMBER')}</option>
                    </Select>
                  ) : (
                    <Badge>{t(`roles.${m.role}`)}</Badge>
                  )}
                </TD>
                <TD>
                  <Badge variant={m.status === 'ACTIVE' ? 'success' : 'warning'}>
                    {t(`settings.members.statuses.${m.status}`)}
                  </Badge>
                  <p className="mt-0.5 text-xs text-foreground-lighter">
                    {t('settings.members.since', {
                      date: format.dateTime(new Date(m.joinedAt), { dateStyle: 'medium' }),
                    })}
                  </p>
                </TD>
                <TD className="text-right">
                  {canManage && m.id !== myMemberId ? (
                    <Button size="tiny" variant="ghost" onClick={() => setToggling(m)}>
                      {m.status === 'ACTIVE'
                        ? t('settings.members.disable')
                        : t('settings.members.enable')}
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {canInvite ? <PendingInvitations /> : null}
      </PageContainer>
      {inviting ? <InvitePanel onClose={() => setInviting(false)} /> : null}
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={
          toggling?.status === 'ACTIVE'
            ? t('settings.members.disable')
            : t('settings.members.enable')
        }
        description={
          toggling?.status === 'ACTIVE'
            ? t('settings.members.disableDescription', { name: toggling.displayName })
            : t('settings.members.enableDescription', { name: toggling?.displayName ?? '' })
        }
        confirmLabel={
          toggling?.status === 'ACTIVE'
            ? t('settings.members.disable')
            : t('settings.members.enable')
        }
        cancelLabel={t('common.cancel')}
        variant={toggling?.status === 'ACTIVE' ? 'destructive' : 'primary'}
        loading={toggle.isPending}
        onConfirm={() => {
          if (toggling) toggle.mutate(toggling)
        }}
      />
    </>
  )
}

function InvitePanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const formId = 'invite-form'

  const invite = useMutation({
    mutationFn: async (body: { email: string; role: Role }) =>
      unwrap(await apiClient.POST('/api/v1/invitations', { body })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.invitations(orgId) })
      onClose()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    invite.mutate({
      email: field(form, 'email').trim(),
      role: field(form, 'role') === 'ADMIN' ? 'ADMIN' : 'MEMBER',
    })
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('settings.members.invite')}
      description={t('settings.members.inviteDescription')}
      closeLabel={t('shell.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" disabled={invite.isPending}>
            {t('settings.members.sendInvite')}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-6" onSubmit={onSubmit}>
        {invite.error ? (
          <Callout variant="destructive">{errorText(t, invite.error)}</Callout>
        ) : null}
        <Field label={t('auth.fields.email')}>
          {(p) => <Input {...p} name="email" type="email" required autoFocus />}
        </Field>
        <Field label={t('settings.members.role')} hint={t('settings.members.roleHint')}>
          {(p) => (
            <Select {...p} name="role" defaultValue="MEMBER">
              <option value="MEMBER">{t('roles.MEMBER')}</option>
              <option value="ADMIN">{t('roles.ADMIN')}</option>
            </Select>
          )}
        </Field>
      </form>
    </SidePanel>
  )
}

function PendingInvitations() {
  const t = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const invitations = useInvitations(orgId)
  const revoke = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await apiClient.POST('/api/v1/invitations/{id}/revoke', { params: { path: { id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(orgId) }),
  })
  const items = invitations.data ?? []
  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-sm text-foreground">{t('settings.members.invitations')}</h2>
      {revoke.error ? <Callout variant="destructive">{errorText(t, revoke.error)}</Callout> : null}
      <Table>
        <THead>
          <tr>
            <TH>{t('auth.fields.email')}</TH>
            <TH>{t('settings.members.role')}</TH>
            <TH>{t('settings.members.expires')}</TH>
            <TH>
              <span className="sr-only">{t('common.actions')}</span>
            </TH>
          </tr>
        </THead>
        <TBody>
          {items.map((i) => (
            <TR key={i.id}>
              <TD>{i.email}</TD>
              <TD>
                <Badge>{t(`roles.${i.role}`)}</Badge>
              </TD>
              <TD className="text-xs text-foreground-light">
                {format.dateTime(new Date(i.expiresAt), { dateStyle: 'medium' })}
              </TD>
              <TD className="text-right">
                <Button
                  size="tiny"
                  variant="ghost"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(i.id)}
                >
                  {t('settings.members.revoke')}
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </section>
  )
}
