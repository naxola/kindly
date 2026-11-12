'use client'

import { Button, Callout, Field, Input, Panel, Select } from '@saas/ui'
import { useMutation } from '@tanstack/react-query'
import { Building2, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { field } from '@/client/forms.ts'
import { slugify } from '@/client/slug.ts'
import { errorText, unwrap } from '@/client/errors.ts'

/** Without an active organization: choose one of one's own or create a new one. */
export function Onboarding({ organizations }: { organizations: { id: string; name: string }[] }) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  const done = () => {
    router.push('/')
    router.refresh()
  }
  const choose = useMutation({
    mutationFn: async (organizationId: string) =>
      unwrap(await apiClient.PUT('/api/v1/me/organization', { body: { organizationId } })),
    onSuccess: done,
  })
  const create = useMutation({
    mutationFn: async (body: { name: string; slug: string; defaultLocale: 'es' | 'en' }) =>
      unwrap(await apiClient.POST('/api/v1/organizations', { body })),
    onSuccess: done,
  })

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    create.mutate({
      name: name.trim(),
      slug: slug || slugify(name),
      defaultLocale: field(form, 'locale') === 'en' ? 'en' : 'es',
    })
  }

  return (
    <div className="w-full max-w-lg space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl text-foreground">{t('onboarding.title')}</h1>
        <p className="text-sm text-foreground-lighter">{t('onboarding.description')}</p>
      </div>
      {organizations.length > 0 ? (
        <Panel title={t('onboarding.chooseTitle')}>
          {choose.error ? (
            <Callout variant="destructive">{errorText(t, choose.error)}</Callout>
          ) : null}
          <ul className="-mx-2 divide-y divide-border">
            {organizations.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={choose.isPending}
                  onClick={() => choose.mutate(o.id)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-sm text-foreground hover:bg-surface-200"
                >
                  <Building2 className="size-4 text-foreground-lighter" />
                  <span className="flex-1">{o.name}</span>
                  <ChevronRight className="size-4 text-foreground-lighter" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel title={t('onboarding.createTitle')} description={t('onboarding.createDescription')}>
        <form className="space-y-4" onSubmit={onCreate}>
          {create.error ? (
            <Callout variant="destructive">{errorText(t, create.error)}</Callout>
          ) : null}
          <Field label={t('onboarding.name')}>
            {(p) => (
              <Input
                {...p}
                name="name"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!slugTouched) setSlug(slugify(e.target.value))
                }}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('onboarding.slug')} hint={t('onboarding.slugHint')}>
              {(p) => (
                <Input
                  {...p}
                  name="slug"
                  required
                  pattern="[a-z0-9][a-z0-9-]{1,46}[a-z0-9]"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(e.target.value.toLowerCase())
                  }}
                />
              )}
            </Field>
            <Field label={t('onboarding.defaultLocale')}>
              {(p) => (
                <Select {...p} name="locale" defaultValue={locale}>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="small" disabled={create.isPending}>
              {t('onboarding.create')}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
