'use client'

import { Button, Callout, Field, Input, Textarea } from '@saas/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { lines, procedureKeys } from './queries.ts'

/**
 * One form for both: a new procedure (name and description too) and a new version of one (steps and
 * documents, prefilled from the current version). Steps and documents are one per line.
 */
export function ProcedureForm({
  procedureId,
  initial,
  submitLabel,
  onDone,
}: {
  procedureId?: string
  initial?: { steps: string[]; documents: string[] }
  submitLabel: string
  onDone?: () => void
}) {
  const t = useTranslations('procedures.form')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: async (f: FormData) => {
      const content = {
        steps: lines(field(f, 'steps')),
        requiredDocuments: lines(field(f, 'requiredDocuments')),
      }
      return procedureId
        ? unwrap(
            await apiClient.POST('/api/v1/procedures/{id}/versions', {
              params: { path: { id: procedureId } },
              body: content,
            }),
          )
        : unwrap(
            await apiClient.POST('/api/v1/procedures', {
              body: {
                ...content,
                name: field(f, 'name').trim(),
                description: field(f, 'description').trim() || null,
              },
            }),
          )
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: procedureKeys.all(orgId) })
      onDone?.()
    },
  })
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    save.mutate(new FormData(e.currentTarget))
  }
  return (
    <form
      // Fresh defaults whenever the current version changes.
      key={initial ? `${initial.steps.join('|')}#${initial.documents.join('|')}` : 'new'}
      onSubmit={onSubmit}
      className="space-y-4"
    >
      {save.error ? <Callout variant="destructive">{errorText(all, save.error)}</Callout> : null}
      {!procedureId ? (
        <>
          <Field label={t('name')}>
            {(p) => <Input {...p} name="name" required maxLength={200} />}
          </Field>
          <Field label={`${t('description')} (${t('optional')})`}>
            {(p) => <Textarea {...p} name="description" rows={2} maxLength={2000} />}
          </Field>
        </>
      ) : null}
      <Field label={`${t('steps')} (${t('optional')})`} hint={t('stepsHint')}>
        {(p) => (
          <Textarea {...p} name="steps" rows={4} defaultValue={initial?.steps.join('\n') ?? ''} />
        )}
      </Field>
      <Field label={`${t('documents')} (${t('optional')})`} hint={t('documentsHint')}>
        {(p) => (
          <Textarea
            {...p}
            name="requiredDocuments"
            rows={4}
            defaultValue={initial?.documents.join('\n') ?? ''}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" disabled={save.isPending}>
        {submitLabel}
      </Button>
    </form>
  )
}
