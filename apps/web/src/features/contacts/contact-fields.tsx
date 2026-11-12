'use client'

import { Field, Input, Textarea } from '@saas/ui'
import { useTranslations } from 'next-intl'
import { field } from '@/client/forms.ts'

export interface ContactFormValues {
  name: string
  phone: string
  email: string
  notes: string
}

interface Contact {
  name: string
  phone: string | null
  email: string | null
  notes: string | null
}

/** The four editable fields of a contact, shared by the creation panel and the detail page. */
export function ContactFields({
  contact,
  disabled = false,
  autoFocus = false,
}: {
  contact?: Contact
  disabled?: boolean
  autoFocus?: boolean
}) {
  const t = useTranslations('contacts')
  return (
    <>
      <Field label={t('fields.name')}>
        {(p) => (
          <Input
            {...p}
            name="name"
            required
            maxLength={160}
            autoFocus={autoFocus}
            disabled={disabled}
            defaultValue={contact?.name ?? ''}
          />
        )}
      </Field>
      <Field label={t('fields.phone')} hint={t('fields.phoneHint')}>
        {(p) => (
          <Input
            {...p}
            name="phone"
            type="tel"
            placeholder="+34600111222"
            disabled={disabled}
            defaultValue={contact?.phone ?? ''}
          />
        )}
      </Field>
      <Field label={t('fields.email')}>
        {(p) => (
          <Input
            {...p}
            name="email"
            type="email"
            disabled={disabled}
            defaultValue={contact?.email ?? ''}
          />
        )}
      </Field>
      <Field label={t('fields.notes')}>
        {(p) => (
          <Textarea
            {...p}
            name="notes"
            rows={3}
            maxLength={4000}
            disabled={disabled}
            defaultValue={contact?.notes ?? ''}
          />
        )}
      </Field>
    </>
  )
}

export function readContactForm(form: FormData): ContactFormValues {
  return {
    name: field(form, 'name').trim(),
    phone: field(form, 'phone').trim(),
    email: field(form, 'email').trim(),
    notes: field(form, 'notes').trim(),
  }
}
