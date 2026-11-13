'use client'

import { Badge, Button, EmptyState } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { ClipboardX } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { ApiError, errorText } from '@/client/errors.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { ProcedureForm } from './procedure-form.tsx'
import { useProcedure } from './queries.ts'

export function ProcedureDetail({ procedureId }: { procedureId: string }) {
  const t = useTranslations('procedures')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const canWrite = useCan()('procedures.write')
  const procedure = useProcedure(orgId, procedureId)

  if (procedure.error) {
    const missing = procedure.error instanceof ApiError && procedure.error.status === 404
    return (
      <PageContainer>
        <EmptyState
          icon={<ClipboardX />}
          title={missing ? t('notFound') : errorText(all, procedure.error)}
          action={
            <Button asChild>
              <Link href="/knowledge/procedures">{t('backList')}</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  const p = procedure.data
  if (!p) return null
  const current = p.versions.find((v) => v.status === 'CURRENT')

  return (
    <>
      <PageHeader title={p.name} description={p.description ?? undefined} />
      <PageContainer size="medium" className="space-y-6">
        {canWrite ? (
          <section className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <h2 className="text-base">{t('publishTitle')}</h2>
              <p className="text-sm text-foreground-lighter">{t('publishHint')}</p>
            </div>
            <ProcedureForm
              procedureId={p.id}
              submitLabel={t('publish')}
              initial={{
                steps: current?.steps.map((s) => s.title) ?? [],
                documents: current?.requiredDocuments.map((d) => d.name) ?? [],
              }}
            />
          </section>
        ) : null}
        <div>
          <h2 className="text-base">{t('versions')}</h2>
          <p className="text-sm text-foreground-lighter">{t('versionsHint')}</p>
        </div>
        {p.versions.map((v) => (
          <section key={v.id} className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium">{t('version', { version: v.version })}</h3>
              <Badge variant={v.status === 'CURRENT' ? 'success' : 'default'}>
                {v.status === 'CURRENT' ? t('current') : t('superseded')}
              </Badge>
              <span className="text-xs text-foreground-lighter">
                {t('published', {
                  date: format.dateTime(new Date(v.createdAt), { dateStyle: 'medium' }),
                })}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground-light">{t('steps')}</p>
              {v.steps.length === 0 ? (
                <p className="text-sm text-foreground-lighter">{t('noSteps')}</p>
              ) : (
                <ol className="list-decimal pl-5 text-sm">
                  {v.steps.map((s) => (
                    <li key={s.id}>{s.title}</li>
                  ))}
                </ol>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground-light">{t('documents')}</p>
              {v.requiredDocuments.length === 0 ? (
                <p className="text-sm text-foreground-lighter">{t('noDocuments')}</p>
              ) : (
                <ul className="list-disc pl-5 text-sm">
                  {v.requiredDocuments.map((d) => (
                    <li key={d.id}>{d.name}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))}
      </PageContainer>
    </>
  )
}
