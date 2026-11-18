'use client'

import { Button, Callout, Field, Input } from '@saas/ui'
import { useTranslations } from 'next-intl'
import NextLink from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { authRequest, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, safeNext } from '@/client/auth.ts'
import { field } from '@/client/forms.ts'
import { errorText } from '@/client/errors.ts'
import { AuthCard } from './auth-card.tsx'

export function SignUpForm() {
  const t = useTranslations()
  const next = safeNext(useSearchParams().get('next'))
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = field(form, 'password')
    if (password !== field(form, 'confirm')) {
      setError(t('auth.errors.PASSWORD_MISMATCH'))
      return
    }
    const email = field(form, 'email')
    setPending(true)
    setError(null)
    const res = await authRequest('/sign-up/email', {
      name: field(form, 'name'),
      email,
      password,
      // After confirming the email, the link signs in and comes back here.
      callbackURL: next,
    })
    setPending(false)
    if (res.ok) setSentTo(email)
    else setError(errorText(t, res.code))
  }

  if (sentTo) {
    return (
      <AuthCard
        title={t('auth.verify.title')}
        description={t('auth.verify.sent', { email: sentTo })}
      >
        <Callout>{t('auth.verify.hint')}</Callout>
        <NextLink
          className="text-sm underline"
          href={`/verify-email?email=${encodeURIComponent(sentTo)}`}
        >
          {t('auth.verify.notReceived')}
        </NextLink>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={t('auth.signUp.title')}
      description={t('auth.signUp.description')}
      footer={
        <>
          {t('auth.signUp.haveAccount')}{' '}
          <NextLink
            className="text-foreground underline"
            href={`/sign-in?next=${encodeURIComponent(next)}`}
          >
            {t('auth.signUp.signIn')}
          </NextLink>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        {error ? <Callout variant="destructive">{error}</Callout> : null}
        <Field label={t('auth.fields.name')}>
          {(p) => <Input {...p} name="name" autoComplete="name" required maxLength={120} />}
        </Field>
        <Field label={t('auth.fields.email')}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" required />}
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
            <Input {...p} name="confirm" type="password" autoComplete="new-password" required />
          )}
        </Field>
        <Button type="submit" variant="primary" size="small" className="w-full" disabled={pending}>
          {t('auth.signUp.submit')}
        </Button>
      </form>
    </AuthCard>
  )
}
