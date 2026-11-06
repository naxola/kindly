'use client'

import { Button, Callout, Field, Input } from '@saas/ui'
import { useTranslations } from 'next-intl'
import NextLink from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { authRequest, safeNext } from '@/client/auth.ts'
import { field } from '@/client/forms.ts'
import { errorText } from '@/client/errors.ts'
import { AuthCard } from './auth-card.tsx'

export function SignInForm() {
  const t = useTranslations()
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get('next'))
  const [error, setError] = useState<string | null>(null)
  const [unverified, setUnverified] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = field(form, 'email')
    setPending(true)
    setError(null)
    setUnverified(null)
    const res = await authRequest('/sign-in/email', {
      email,
      password: field(form, 'password'),
    })
    setPending(false)
    if (res.ok) {
      router.push(next)
      router.refresh()
      return
    }
    if (res.code === 'EMAIL_NOT_VERIFIED') setUnverified(email)
    else setError(errorText(t, res.code))
  }

  return (
    <AuthCard
      title={t('auth.signIn.title')}
      description={t('auth.signIn.description')}
      footer={
        <>
          {t('auth.signIn.noAccount')}{' '}
          <NextLink
            className="text-foreground underline"
            href={`/sign-up?next=${encodeURIComponent(next)}`}
          >
            {t('auth.signIn.signUp')}
          </NextLink>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)} noValidate={false}>
        {error ? <Callout variant="destructive">{error}</Callout> : null}
        {unverified ? (
          <Callout variant="warning" title={t('auth.signIn.unverifiedTitle')}>
            {t('auth.signIn.unverified')}{' '}
            <NextLink
              className="underline"
              href={`/verify-email?email=${encodeURIComponent(unverified)}`}
            >
              {t('auth.verify.resend')}
            </NextLink>
          </Callout>
        ) : null}
        <Field label={t('auth.fields.email')}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" required />}
        </Field>
        <Field label={t('auth.fields.password')}>
          {(p) => (
            <Input
              {...p}
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </Field>
        <div className="flex items-center justify-between">
          <NextLink className="text-xs text-foreground-light underline" href="/forgot-password">
            {t('auth.signIn.forgot')}
          </NextLink>
          <Button
            type="submit"
            variant="primary"
            size="small"
            disabled={pending}
            aria-busy={pending}
          >
            {t('auth.signIn.submit')}
          </Button>
        </div>
      </form>
    </AuthCard>
  )
}
