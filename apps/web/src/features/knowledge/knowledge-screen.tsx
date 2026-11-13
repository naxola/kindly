'use client'

import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Input,
  SidePanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { Upload } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { ApiError, errorText } from '@/client/errors.ts'
import { field } from '@/client/forms.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { CitationCard } from './citation-card.tsx'
import { IngestionState, STATUS_BADGE } from './parts.tsx'
import { useKnowledgeDocuments, useKnowledgeSearch } from './queries.ts'
import { UploadForm } from './upload-form.tsx'

/** Knowledge: a search over what is in force and the list of documents. The query is in the URL. */
export function KnowledgeScreen() {
  const t = useTranslations('knowledge')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const canWrite = useCan()('knowledge.write')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const q = params.get('q') ?? ''
  const atDate = params.get('at') ?? ''
  const [uploading, setUploading] = useState(false)
  const docs = useKnowledgeDocuments(orgId)
  const results = useKnowledgeSearch(orgId, q, atDate)

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = new URLSearchParams()
    const query = field(form, 'q').trim()
    const at = field(form, 'at')
    if (query) next.set('q', query)
    if (at) next.set('at', at)
    router.push(next.size ? `${pathname}?${next}` : pathname)
  }

  const unavailable =
    results.error instanceof ApiError && results.error.reason === 'EMBEDDINGS_NOT_CONFIGURED'

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button asChild>
              <Link href="/knowledge/procedures">{all('procedures.link')}</Link>
            </Button>
            {canWrite ? (
              <Button variant="primary" onClick={() => setUploading(true)}>
                <Upload aria-hidden />
                {t('upload')}
              </Button>
            ) : null}
          </>
        }
      />
      <PageContainer className="space-y-8">
        <section className="space-y-3">
          <h2 className="text-base">{t('search')}</h2>
          <p className="text-sm text-foreground-lighter">{t('searchHint')}</p>
          <form role="search" onSubmit={onSearch} className="flex max-w-2xl flex-wrap gap-2">
            <Input
              type="search"
              name="q"
              defaultValue={q}
              aria-label={t('searchLabel')}
              placeholder={t('searchPlaceholder')}
              className="min-w-0 flex-1"
            />
            <Input
              type="date"
              name="at"
              defaultValue={atDate}
              aria-label={t('atDate')}
              title={t('atDateHint')}
              className="w-44"
            />
            <Button type="submit">{t('search')}</Button>
          </form>
          {unavailable ? (
            <Callout variant="warning" title={t('searchUnavailable')}>
              {errorText(all, results.error)}
            </Callout>
          ) : results.error ? (
            <Callout variant="destructive">{errorText(all, results.error)}</Callout>
          ) : null}
          {results.data ? (
            results.data.length === 0 ? (
              <EmptyState title={t('noResults')} description={t('noResultsHint')} />
            ) : (
              <ul className="space-y-3" aria-label={t('resultsLabel')}>
                {results.data.map((r) => (
                  <li key={r.chunkId}>
                    <CitationCard result={r} />
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-base">{t('documents')}</h2>
          {docs.error ? (
            <Callout variant="destructive">{errorText(all, docs.error)}</Callout>
          ) : null}
          {(docs.data ?? []).length === 0 && !docs.isPending ? (
            <EmptyState
              title={t('empty')}
              description={canWrite ? t('emptyAdmin') : t('emptyMember')}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('columns.title')}</TH>
                  <TH>{t('columns.origin')}</TH>
                  <TH>{t('columns.scope')}</TH>
                  <TH>{t('columns.visibility')}</TH>
                  <TH>{t('columns.state')}</TH>
                </TR>
              </THead>
              <TBody>
                {(docs.data ?? []).map((d) => {
                  const latest = d.versions.find((v) => v.status === 'CURRENT') ?? d.versions[0]
                  return (
                    <TR key={d.id}>
                      <TD>
                        <Link
                          href={`/knowledge/${d.id}`}
                          className="text-foreground hover:underline"
                        >
                          {d.title}
                        </Link>
                      </TD>
                      <TD className="text-foreground-lighter">{t(`sourceType.${d.sourceType}`)}</TD>
                      <TD className="text-foreground-lighter">
                        {[d.jurisdiction, d.territory, d.scope].filter(Boolean).join(' · ') || '—'}
                      </TD>
                      <TD>
                        <Badge variant={d.visibility === 'GLOBAL' ? 'brand' : 'default'}>
                          {t(`visibility.${d.visibility}`)}
                        </Badge>
                      </TD>
                      <TD>
                        {latest ? (
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <Badge variant={STATUS_BADGE[latest.status]}>
                              {t(`status.${latest.status}`)}
                            </Badge>
                            <IngestionState version={latest} />
                          </span>
                        ) : (
                          '—'
                        )}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </section>
      </PageContainer>
      <SidePanel
        open={uploading}
        onOpenChange={setUploading}
        title={t('uploadTitle')}
        closeLabel={all('shell.close')}
      >
        <UploadForm
          path="/api/v1/knowledge/documents"
          withDocumentFields
          onDone={() => setUploading(false)}
        />
      </SidePanel>
    </>
  )
}
