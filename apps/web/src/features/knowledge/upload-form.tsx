'use client'

import { Button, Callout, Field, Input, Select } from '@saas/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { errorText } from '@/client/errors.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'
import { knowledgeKeys, postForm } from './queries.ts'

type Origin = 'PDF' | 'TEXT' | 'WEB'

/**
 * Shared by "Upload document" (a new document: also asks for title and scope) and "New version" (an
 * existing one). The server answers 202 and the version is processed in the background: the lists
 * poll its status. Anything wrong with the source comes back as a code, shown translated.
 */
export function UploadForm({
  path,
  withDocumentFields,
  onDone,
}: {
  path: string
  withDocumentFields: boolean
  onDone: () => void
}) {
  const t = useTranslations('knowledge.form')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const [origin, setOrigin] = useState<Origin>('PDF')
  const send = useMutation({
    mutationFn: (form: FormData) => postForm<{ versionId: string }>(path, form),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: knowledgeKeys.all(orgId) })
      onDone()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    // A field left blank is not sent; the file input of the other origin is not either.
    for (const [k, v] of [...form.entries()])
      if (v === '' || (v instanceof File && v.size === 0 && origin === 'WEB')) form.delete(k)
    send.mutate(form)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {send.error ? <Callout variant="destructive">{errorText(all, send.error)}</Callout> : null}
      {withDocumentFields ? (
        <>
          <Field label={t('title')}>
            {(p) => <Input {...p} name="title" required maxLength={300} />}
          </Field>
          <Field label={`${t('jurisdiction')} (${t('optional')})`} hint={t('jurisdictionHint')}>
            {(p) => <Input {...p} name="jurisdiction" maxLength={120} />}
          </Field>
          <Field label={`${t('territory')} (${t('optional')})`}>
            {(p) => <Input {...p} name="territory" maxLength={120} />}
          </Field>
          <Field label={`${t('scope')} (${t('optional')})`}>
            {(p) => <Input {...p} name="scope" maxLength={120} />}
          </Field>
        </>
      ) : null}
      <Field label={t('origin')}>
        {(p) => (
          <Select
            {...p}
            name="origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value as Origin)}
          >
            <option value="PDF">{t('originPDF')}</option>
            <option value="TEXT">{t('originTEXT')}</option>
            <option value="WEB">{t('originWEB')}</option>
          </Select>
        )}
      </Field>
      {origin === 'WEB' ? (
        <Field label={t('url')} hint={t('urlHint')}>
          {(p) => (
            <Input {...p} name="url" type="url" required placeholder="https://" maxLength={2000} />
          )}
        </Field>
      ) : (
        <Field label={t('file')} hint={t('fileHint')}>
          {(p) => (
            <Input
              {...p}
              name="file"
              type="file"
              required
              accept={
                origin === 'PDF' ? 'application/pdf,.pdf' : '.txt,.md,text/plain,text/markdown'
              }
            />
          )}
        </Field>
      )}
      <Field label={t('version')} hint={t('versionHint')}>
        {(p) => <Input {...p} name="version" required maxLength={60} />}
      </Field>
      <Field label={t('from')}>
        {(p) => <Input {...p} name="effectiveFrom" type="date" required />}
      </Field>
      <Field label={`${t('until')} (${t('optional')})`} hint={t('untilHint')}>
        {(p) => <Input {...p} name="effectiveUntil" type="date" />}
      </Field>
      <Field label={`${t('sourceNote')} (${t('optional')})`} hint={t('sourceNoteHint')}>
        {(p) => <Input {...p} name="sourceNote" maxLength={600} />}
      </Field>
      <Field label={t('status')} hint={t('statusHint')}>
        {(p) => (
          <Select {...p} name="status" defaultValue="CURRENT">
            <option value="CURRENT">{t('CURRENT')}</option>
            <option value="DRAFT">{t('DRAFT')}</option>
          </Select>
        )}
      </Field>
      <Button type="submit" variant="primary" disabled={send.isPending}>
        {t('submit')}
      </Button>
    </form>
  )
}
