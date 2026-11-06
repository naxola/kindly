'use client'

import { Button, Callout, Field, Input } from '@saas/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { authRequest, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/client/auth.ts'
import { field } from '@/client/forms.ts'
import { ApiError, errorText, unwrap } from '@/client/errors.ts'
import { AuthCard } from '@/features/auth/auth-card.tsx'

const STORAGE_KEY = 'saas.invitationToken'

/** Reads the token from the fragment (#token) and keeps it to survive sign-in. */
function useInvitationToken() {
  const [token, setToken] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    const fromHash = window.location.hash.slice(1)
    if (fromHash) {
      sessionStorage.setItem(STORAGE_KEY, fromHash)
      // The token does not stay in the address bar or in the history.
      window.history.replaceState(null, '', window.location.pathname)
    }
    setToken(fromHash || sessionStorage.getItem(STORAGE_KEY))
  }, [])
  return token
}

/**
 * What a person sees when opening an invitation link, by situation:
 * - pending, email without account → create the account here (only name and password;
 *   the link already proves the email) and join;
 * - pending, email with account → sign in to join;
 * - pending, signed in with that email → accept;
 * - already used → it says so, and offers sign-in (or going to the app);
 * - revoked or expired → it says so, with nothing to click.
 */
export function InvitationScreen() {
  const t = useTranslations()
  const format = useFormatter()
  const router = useRouter()
  const token = useInvitationToken()

  const preview = useQuery({
    queryKey: ['invitation', 'preview', token],
    enabled: !!token,
    retry: false,
    queryFn: async () =>
      unwrap(await apiClient.POST('/api/v1/invitations/preview', { body: { token: token! } })),
  })
  const me = useQuery({
    queryKey: ['me'],
    retry: false,
    // Who is signed in decides the screen: always ask, never trust an older answer.
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/me')
      return res.response.status === 401 ? null : unwrap(res)
    },
  })
  const joined = () => {
    sessionStorage.removeItem(STORAGE_KEY)
    router.push('/')
    router.refresh()
  }
  const accept = useMutation({
    mutationFn: async () =>
      unwrap(await apiClient.POST('/api/v1/invitations/accept', { body: { token: token! } })),
    onSuccess: joined,
  })
  const register = useMutation({
    mutationFn: async (body: { name: string; password: string }) =>
      unwrap(
        await apiClient.POST('/api/v1/invitations/register', { body: { token: token!, ...body } }),
      ),
    onSuccess: joined,
  })
  const [mismatch, setMismatch] = useState(false)

  if (token === undefined || (token && (preview.isPending || me.isPending))) {
    return <AuthCard title={t('invite.title')}>{null}</AuthCard>
  }
  if (!token || preview.error) {
    const notFound = !token || (preview.error instanceof ApiError && preview.error.status === 404)
    return (
      <AuthCard title={t('invite.title')}>
        <Callout variant="destructive">
          {notFound ? t('invite.notFound') : errorText(t, preview.error)}
        </Callout>
      </AuthCard>
    )
  }

  const inv = preview.data!
  const access = me.data?.access ?? null
  const matches = !!access && access.email.toLowerCase() === inv.email.toLowerCase()
  const signInHref = `/sign-in?next=${encodeURIComponent('/invite')}&email=${encodeURIComponent(inv.email)}`
  const title = t('invite.joinTitle', { organization: inv.organizationName })

  // Already used: the account exists. Nothing to accept; offer the way in.
  if (inv.status === 'ACCEPTED') {
    return (
      <AuthCard title={t('invite.title')}>
        <Callout variant="warning" title={t('invite.used.title')}>
          {t('invite.used.body', { email: inv.email, organization: inv.organizationName })}
        </Callout>
        {access ? (
          <Button asChild variant="primary" size="small">
            <NextLink href="/">{t('invite.used.goToApp')}</NextLink>
          </Button>
        ) : (
          <Button asChild variant="primary" size="small">
            <NextLink href={`/sign-in?email=${encodeURIComponent(inv.email)}`}>
              {t('invite.signIn')}
            </NextLink>
          </Button>
        )}
      </AuthCard>
    )
  }
  if (inv.status !== 'PENDING') {
    return (
      <AuthCard title={t('invite.title')}>
        <Callout variant="warning">{t(`invite.statusMessage.${inv.status}`)}</Callout>
      </AuthCard>
    )
  }

  const description = t('invite.description', {
    email: inv.email,
    date: format.dateTime(new Date(inv.expiresAt), { dateStyle: 'medium' }),
  })

  if (access && !matches) {
    return (
      <AuthCard title={title} description={description}>
        <Callout variant="warning">{t('invite.otherEmail', { email: access.email })}</Callout>
        <Button
          size="small"
          onClick={() =>
            void authRequest('/sign-out', {}).then(() => {
              router.refresh()
              void me.refetch()
            })
          }
        >
          {t('invite.switchAccount')}
        </Button>
      </AuthCard>
    )
  }

  if (access && matches) {
    return (
      <AuthCard title={title} description={description}>
        {accept.error ? (
          <Callout variant="destructive">{errorText(t, accept.error)}</Callout>
        ) : null}
        <Button
          variant="primary"
          size="small"
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {t('invite.accept')}
        </Button>
      </AuthCard>
    )
  }

  if (inv.emailRegistered) {
    return (
      <AuthCard title={title} description={description}>
        <p className="text-sm text-foreground-light">
          {t('invite.hasAccount', { email: inv.email })}
        </p>
        <Button asChild variant="primary" size="small">
          <NextLink href={signInHref}>{t('invite.signInToJoin')}</NextLink>
        </Button>
      </AuthCard>
    )
  }

  function onRegister(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = field(form, 'password')
    if (password !== field(form, 'confirm')) {
      setMismatch(true)
      return
    }
    setMismatch(false)
    register.mutate({ name: field(form, 'name').trim(), password })
  }

  return (
    <AuthCard title={title} description={t('invite.createDescription')}>
      <form className="space-y-4" onSubmit={onRegister}>
        {mismatch ? (
          <Callout variant="destructive">{t('auth.errors.PASSWORD_MISMATCH')}</Callout>
        ) : register.error ? (
          <Callout variant="destructive">{errorText(t, register.error)}</Callout>
        ) : null}
        <Field label={t('auth.fields.email')} hint={t('invite.emailFixed')}>
          {(p) => <Input {...p} value={inv.email} readOnly disabled />}
        </Field>
        <Field label={t('auth.fields.name')}>
          {(p) => <Input {...p} name="name" autoComplete="name" required maxLength={120} />}
        </Field>
        <Field
          label={t('auth.fields.password')}
          hint={t('auth.fields.passwordHint', { min: PASSWORD_MIN_LENGTH })}
        >
          {(p) => (
            <Input
              {...p}
              name="password"
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
        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="small" disabled={register.isPending}>
            {t('invite.createAndJoin')}
          </Button>
        </div>
      </form>
    </AuthCard>
  )
}
