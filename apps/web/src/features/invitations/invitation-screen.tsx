'use client'

import { Button, Callout } from '@saas/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useFormatter, useTranslations } from 'next-intl'
import NextLink from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { apiClient } from '@/client/api.ts'
import { authRequest } from '@/client/auth.ts'
import { ApiError, errorText, unwrap } from '@/client/errors.ts'
import { AuthCard } from '@/features/auth/auth-card.tsx'

const STORAGE_KEY = 'saas.invitationToken'

/** Reads the token from the fragment (#token) and keeps it to survive sign-up or sign-in. */
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
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/me')
      return res.response.status === 401 ? null : unwrap(res)
    },
  })
  const accept = useMutation({
    mutationFn: async () =>
      unwrap(await apiClient.POST('/api/v1/invitations/accept', { body: { token: token! } })),
    onSuccess: () => {
      sessionStorage.removeItem(STORAGE_KEY)
      router.push('/')
      router.refresh()
    },
  })

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
  const access = me.data?.access
  const matches = access && access.email.toLowerCase() === inv.email.toLowerCase()
  const next = encodeURIComponent('/invite')

  return (
    <AuthCard
      title={t('invite.joinTitle', { organization: inv.organizationName })}
      description={t('invite.description', {
        email: inv.email,
        date: format.dateTime(new Date(inv.expiresAt), { dateStyle: 'medium' }),
      })}
    >
      {inv.status !== 'PENDING' ? (
        <Callout variant="warning">{t(`invite.statusMessage.${inv.status}`)}</Callout>
      ) : !access ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground-light">{t('invite.needAccount')}</p>
          <div className="flex gap-2">
            <Button asChild variant="primary" size="small">
              <NextLink href={`/sign-up?next=${next}`}>{t('invite.signUp')}</NextLink>
            </Button>
            <Button asChild size="small">
              <NextLink href={`/sign-in?next=${next}`}>{t('invite.signIn')}</NextLink>
            </Button>
          </div>
        </div>
      ) : !matches ? (
        <div className="space-y-3">
          <Callout variant="warning">{t('invite.otherEmail', { email: access.email })}</Callout>
          <Button
            size="small"
            onClick={() =>
              void authRequest('/sign-out', {}).then(() => {
                router.push(`/sign-in?next=${next}`)
                router.refresh()
              })
            }
          >
            {t('invite.switchAccount')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
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
        </div>
      )}
    </AuthCard>
  )
}
