'use client'

import { Button, Callout, EmptyState, SidePanel, Table, TBody, TD, TH, THead, TR } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { ClipboardList, Plus } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { errorText } from '@/client/errors.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { ProcedureForm } from './procedure-form.tsx'
import { useProcedures } from './queries.ts'

export function ProceduresScreen() {
  const t = useTranslations('procedures')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const canWrite = useCan()('procedures.write')
  const procedures = useProcedures(orgId)
  const [creating, setCreating] = useState(false)
  const items = procedures.data ?? []
  return (
    <>
      <PageHeader
        title={
          <>
            <Link
              href="/knowledge"
              className="mb-1 block text-sm text-foreground-lighter hover:underline"
            >
              {t('back')}
            </Link>
            {t('title')}
          </>
        }
        description={t('description')}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              {t('new')}
            </Button>
          ) : null
        }
      />
      <PageContainer size="medium">
        {procedures.error ? (
          <Callout variant="destructive">{errorText(all, procedures.error)}</Callout>
        ) : null}
        {items.length === 0 && !procedures.isPending ? (
          <EmptyState
            icon={<ClipboardList />}
            title={t('empty')}
            description={canWrite ? t('emptyAdmin') : t('emptyMember')}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('columns.name')}</TH>
                <TH>{t('columns.description')}</TH>
                <TH>{t('columns.version')}</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link
                      href={`/knowledge/procedures/${p.id}`}
                      className="text-foreground hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TD>
                  <TD className="text-foreground-lighter">{p.description ?? '—'}</TD>
                  <TD className="text-foreground-lighter">{p.currentVersion ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </PageContainer>
      <SidePanel
        open={creating}
        onOpenChange={setCreating}
        title={t('newTitle')}
        closeLabel={all('shell.close')}
      >
        <ProcedureForm submitLabel={t('create')} onDone={() => setCreating(false)} />
      </SidePanel>
    </>
  )
}
