'use client'

import { Button, Callout, Field, Input, Panel, Select, toast } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { authRequest, AuthError, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/client/auth.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { QueryError } from '@/components/query-error.tsx'
import { TableSkeleton } from '@/components/table-skeleton.tsx'
import { LOCALE_COOKIE } from '@/i18n/locales.ts'
import { PrivacyPanels } from './privacy.tsx'
import { SessionsPanel, TwoFactorPanel } from './security.tsx'

/**
 * Personal settings: they belong to the person, not to the organization, so they need no
 * permission. Name and language go through the API; the password through Better Auth.
 */
export function AccountSettings() {
  const t = useTranslations()
  const me = useQuery({
    queryKey: ['me'],
    staleTime: 0,
    queryFn: async () => unwrap(await apiClient.GET('/api/v1/me')),
  })

  return (
    <>
      <PageHeader
        title={t('settings.account.title')}
        description={t('settings.account.description')}
      />
      <PageContainer className="space-y-8">
        {me.isPending ? <TableSkeleton rows={2} label={t('states.loading')} /> : null}
        {me.isError ? <QueryError error={me.error} onRetry={() => void me.refetch()} /> : null}
        {me.data?.user ? (
          <>
            <ProfileForm name={me.data.user.displayName} locale={me.data.user.locale} />
            <EmailChangeForm current={me.data.access.email} />
            <PasswordForm />
            <TwoFactorPanel />
            <SessionsPanel />
            <PrivacyPanels />
          </>
        ) : null}
      </PageContainer>
    </>
  )
}

function ProfileForm({ name, locale }: { name: string; locale: 'es' | 'en' | null }) {
  const t = useTranslations()
  const router = useRouter()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: async (body: { displayName: string; locale: 'es' | 'en' | null }) =>
      unwrap(await apiClient.PATCH('/api/v1/me', { body })),
    onSuccess: async (updated) => {
      toast.success(t('toasts.profileSaved'))
      // The cookie of this browser wins over the preference: keep both in step.
      if (updated.locale) {
        document.cookie = `${LOCALE_COOKIE}=${updated.locale}; path=/; max-age=31536000; samesite=lax`
      }
      await qc.invalidateQueries({ queryKey: ['me'] })
      router.refresh()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const chosen = field(form, 'locale')
    save.mutate({
      displayName: field(form, 'name').trim(),
      locale: chosen === 'es' || chosen === 'en' ? chosen : null,
    })
  }

  return (
    <Panel title={t('settings.account.profile')} description={t('settings.account.profileHint')}>
      <form className="max-w-md space-y-4" onSubmit={onSubmit}>
        {save.error ? <Callout variant="destructive">{errorText(t, save.error)}</Callout> : null}
        <Field label={t('auth.fields.name')}>
          {(p) => (
            <Input
              {...p}
              name="name"
              defaultValue={name}
              required
              maxLength={120}
              autoComplete="name"
            />
          )}
        </Field>
        <Field label={t('settings.account.language')} hint={t('settings.account.languageHint')}>
          {(p) => (
            <Select {...p} name="locale" defaultValue={locale ?? ''}>
              <option value="">{t('settings.account.languageDefault')}</option>
              <option value="es">Español</option>
              <option value="en">English</option>
            </Select>
          )}
        </Field>
        <Button type="submit" size="small" variant="primary" disabled={save.isPending}>
          {t('settings.billing.save')}
        </Button>
      </form>
    </Panel>
  )
}

function EmailChangeForm({ current }: { current: string }) {
  const t = useTranslations()
  const [requested, setRequested] = useState<string | null>(null)
  const change = useMutation({
    mutationFn: async (newEmail: string) => {
      const res = await authRequest('/change-email', {
        newEmail,
        callbackURL: '/settings/account',
      })
      if (!res.ok) throw new AuthError(res.code ?? 'UNKNOWN')
      return newEmail
    },
    onSuccess: (newEmail) => setRequested(newEmail),
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setRequested(null)
    change.mutate(field(new FormData(e.currentTarget), 'newEmail').trim())
  }

  return (
    <Panel title={t('settings.account.email')} description={t('settings.account.emailHint')}>
      <form className="max-w-md space-y-4" onSubmit={onSubmit}>
        {change.error ? (
          <Callout variant="destructive">{errorText(t, change.error)}</Callout>
        ) : null}
        {requested ? (
          <Callout variant="success">
            {t('settings.account.emailRequested', { current, email: requested })}
          </Callout>
        ) : null}
        <Field label={t('settings.account.currentEmail')}>
          {(p) => <Input {...p} value={current} readOnly disabled />}
        </Field>
        <Field label={t('settings.account.newEmail')}>
          {(p) => <Input {...p} name="newEmail" type="email" autoComplete="email" required />}
        </Field>
        <Button type="submit" size="small" variant="primary" disabled={change.isPending}>
          {t('settings.account.changeEmail')}
        </Button>
      </form>
    </Panel>
  )
}

function PasswordForm() {
  const t = useTranslations()
  const [mismatch, setMismatch] = useState(false)
  const change = useMutation({
    mutationFn: async (body: { currentPassword: string; newPassword: string }) => {
      const res = await authRequest('/change-password', { ...body, revokeOtherSessions: true })
      if (!res.ok) throw new AuthError(res.code ?? 'UNKNOWN')
    },
    onSuccess: () => toast.success(t('toasts.passwordChanged')),
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const newPassword = field(form, 'newPassword')
    if (newPassword !== field(form, 'confirm')) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    change.mutate(
      { currentPassword: field(form, 'currentPassword'), newPassword },
      { onSuccess: () => formEl.reset() },
    )
  }

  return (
    <Panel title={t('settings.account.password')} description={t('settings.account.passwordHint')}>
      <form className="max-w-md space-y-4" onSubmit={onSubmit}>
        {mismatch ? (
          <Callout variant="destructive">{t('auth.errors.PASSWORD_MISMATCH')}</Callout>
        ) : change.error ? (
          <Callout variant="destructive">{errorText(t, change.error)}</Callout>
        ) : null}
        <Field label={t('settings.account.currentPassword')}>
          {(p) => (
            <Input
              {...p}
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={PASSWORD_MAX_LENGTH}
            />
          )}
        </Field>
        <Field
          label={t('auth.fields.newPassword')}
          hint={t('auth.fields.passwordHint', { min: PASSWORD_MIN_LENGTH })}
        >
          {(p) => (
            <Input
              {...p}
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
            />
          )}
        </Field>
        <Field label={t('auth.fields.confirmPassword')}>
          {(p) => (
            <Input
              {...p}
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
            />
          )}
        </Field>
        <Button type="submit" size="small" variant="primary" disabled={change.isPending}>
          {t('settings.account.changePassword')}
        </Button>
      </form>
    </Panel>
  )
}
