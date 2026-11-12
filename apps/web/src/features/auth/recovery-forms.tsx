'use client'

import { Button, Callout, Field, Input } from '@saas/ui'
import { useTranslations } from 'next-intl'
import NextLink from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { authRequest, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/client/auth.ts'
import { field } from '@/client/forms.ts'
import { errorText } from '@/client/errors.ts'
import { AuthCard } from './auth-card.tsx'

/** Resend of the verification email. The answer is the same whether the account exists or not. */
export function VerifyEmailForm() {
  const t = useTranslations()
  const params = useSearchParams()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = field(new FormData(e.currentTarget), 'email')
    const res = await authRequest('/send-verification-email', { email, callbackURL: '/' })
    if (res.ok) setSent(true)
    else setError(errorText(t, res.code))
  }

  return (
    <AuthCard title={t('auth.verify.title')} description={t('auth.verify.description')}>
      {sent ? <Callout variant="success">{t('auth.verify.resent')}</Callout> : null}
      {error ? <Callout variant="destructive">{error}</Callout> : null}
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <Field label={t('auth.fields.email')}>
          {(p) => (
            <Input
              {...p}
              name="email"
              type="email"
              required
              defaultValue={params.get('email') ?? ''}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" size="small" className="w-full">
          {t('auth.verify.resend')}
        </Button>
      </form>
    </AuthCard>
  )
}

export function ForgotPasswordForm() {
  const t = useTranslations()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const email = field(new FormData(e.currentTarget), 'email')
    const res = await authRequest('/request-password-reset', {
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (res.ok) setSent(true)
    else setError(errorText(t, res.code))
  }

  return (
    <AuthCard
      title={t('auth.forgot.title')}
      description={t('auth.forgot.description')}
      footer={
        <NextLink className="underline" href="/sign-in">
          {t('auth.backToSignIn')}
        </NextLink>
      }
    >
      {sent ? (
        <Callout variant="success">{t('auth.forgot.sent')}</Callout>
      ) : (
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {error ? <Callout variant="destructive">{error}</Callout> : null}
          <Field label={t('auth.fields.email')}>
            {(p) => <Input {...p} name="email" type="email" autoComplete="email" required />}
          </Field>
          <Button type="submit" variant="primary" size="small" className="w-full">
            {t('auth.forgot.submit')}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}

export function ResetPasswordForm() {
  const t = useTranslations()
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token')
  const invalid = params.get('error') === 'INVALID_TOKEN' || !token
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const newPassword = field(form, 'password')
    if (newPassword !== field(form, 'confirm')) {
      setError(t('auth.errors.PASSWORD_MISMATCH'))
      return
    }
    const res = await authRequest('/reset-password', { token, newPassword })
    if (res.ok) router.push('/sign-in?reset=1')
    else setError(errorText(t, res.code))
  }

  return (
    <AuthCard title={t('auth.reset.title')} description={t('auth.reset.description')}>
      {invalid ? (
        <Callout variant="destructive">
          {t('auth.errors.INVALID_TOKEN')}{' '}
          <NextLink className="underline" href="/forgot-password">
            {t('auth.reset.requestNew')}
          </NextLink>
        </Callout>
      ) : (
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {error ? <Callout variant="destructive">{error}</Callout> : null}
          <Field
            label={t('auth.fields.newPassword')}
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
              <Input {...p} name="confirm" type="password" autoComplete="new-password" required />
            )}
          </Field>
          <Button type="submit" variant="primary" size="small" className="w-full">
            {t('auth.reset.submit')}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
