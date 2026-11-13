'use client'

import { Badge, Button, Callout, EmptyState, SidePanel } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { BookX } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ApiError, errorText } from '@/client/errors.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { IngestionState, STATUS_BADGE, useValidity } from './parts.tsx'
import { useKnowledgeDocument, useVersionChunks, type KnowledgeVersionData } from './queries.ts'
import { UploadForm } from './upload-form.tsx'

/** A document: its data and, newest validity first, its versions with their fragments. */
export function DocumentDetail({ documentId }: { documentId: string }) {
  const t = useTranslations('knowledge')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const canWrite = useCan()('knowledge.write')
  const doc = useKnowledgeDocument(orgId, documentId)
  const [adding, setAdding] = useState(false)

  if (doc.error) {
    const missing = doc.error instanceof ApiError && doc.error.status === 404
    return (
      <PageContainer>
        <EmptyState
          icon={<BookX />}
          title={missing ? t('notFound') : errorText(all, doc.error)}
          action={
            <Button asChild>
              <Link href="/knowledge">{t('back')}</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  const d = doc.data
  if (!d) return null
  const scope = [d.jurisdiction, d.territory, d.scope].filter(Boolean).join(' · ')

  return (
    <>
      <PageHeader
        title={d.title}
        description={[t(`visibility.${d.visibility}`), t(`sourceType.${d.sourceType}`), scope]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {d.sourceUrl ? (
              <a
                href={d.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-foreground-lighter underline"
              >
                {t('viewSource')}
              </a>
            ) : null}
            {canWrite && d.visibility === 'ORGANIZATION' ? (
              <Button variant="primary" onClick={() => setAdding(true)}>
                {t('newVersion')}
              </Button>
            ) : null}
          </>
        }
      />
      <PageContainer size="medium" className="space-y-6">
        <div>
          <h2 className="text-base">{t('versions')}</h2>
          <p className="text-sm text-foreground-lighter">{t('versionsHint')}</p>
        </div>
        {d.versions.length === 0 ? (
          <p className="text-sm text-foreground-lighter">{t('noVersions')}</p>
        ) : (
          d.versions.map((v) => <VersionCard key={v.id} version={v} />)
        )}
      </PageContainer>
      <SidePanel
        open={adding}
        onOpenChange={setAdding}
        title={t('newVersionTitle')}
        closeLabel={all('common.close')}
      >
        <UploadForm
          path={`/api/v1/knowledge/documents/${d.id}/versions`}
          withDocumentFields={false}
          onDone={() => setAdding(false)}
        />
      </SidePanel>
    </>
  )
}

function VersionCard({ version: v }: { version: KnowledgeVersionData }) {
  const t = useTranslations('knowledge')
  const orgId = useOrganizationId()
  const validity = useValidity()
  const [open, setOpen] = useState(false)
  const chunks = useVersionChunks(orgId, v.id, open)
  return (
    <section className="space-y-2 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">{t('version', { version: v.version })}</h3>
        <Badge variant={STATUS_BADGE[v.status]}>{t(`status.${v.status}`)}</Badge>
        <IngestionState version={v} />
      </div>
      <p className="text-sm text-foreground-lighter">
        {validity(v.effectiveFrom, v.effectiveUntil)}
        {v.source ? ` · ${v.source}` : ''}
      </p>
      {v.ingestionStatus === 'READY' ? (
        <>
          <Button onClick={() => setOpen((x) => !x)} aria-expanded={open}>
            {open ? t('hideChunks') : t('showChunks')}
          </Button>
          {open ? (
            chunks.error ? (
              <Callout variant="destructive">{String(chunks.error)}</Callout>
            ) : (chunks.data ?? []).length === 0 && !chunks.isPending ? (
              <p className="text-sm text-foreground-lighter">{t('noChunks')}</p>
            ) : (
              <div className="space-y-3">
                {(chunks.data ?? []).map((c) => (
                  <div key={c.id} className="space-y-1">
                    <p className="text-xs text-foreground-light">
                      {c.label ?? t(`level.${c.level}`)}
                      {c.path && c.path !== c.label ? ` · ${c.path}` : ''}
                    </p>
                    <p className="whitespace-pre-line text-sm">{c.content}</p>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </>
      ) : null}
    </section>
  )
}
