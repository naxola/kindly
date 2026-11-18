'use client'

import {
  Button,
  Callout,
  EmptyState,
  SidePanel,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  cn,
} from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ListChecks, Plus } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useState, type FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { readTaskForm, TaskFields } from './task-fields.tsx'
import { taskKeys, useTasks } from './queries.ts'

const FILTERS = ['all', 'pending', 'done'] as const

/** Tasks the person may see: the general ones and those of contacts they may see. */
export function TasksList() {
  const t = useTranslations('tasks')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const canWrite = useCan()('tasks.write')
  const qc = useQueryClient()
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('all')
  const [creating, setCreating] = useState(false)
  const tasks = useTasks(orgId, status)
  const items = tasks.data ?? []

  const toggle = useMutation({
    mutationFn: async (task: { id: string; completedAt: string | null }) =>
      unwrap(
        await apiClient.PUT('/api/v1/tasks/{id}/completed', {
          params: { path: { id: task.id } },
          body: { completed: task.completedAt === null },
        }),
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: taskKeys.all(orgId) }),
  })
  const error = tasks.error ?? toggle.error

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canWrite ? (
            <Button variant="primary" size="small" onClick={() => setCreating(true)}>
              <Plus /> {t('new')}
            </Button>
          ) : null
        }
      />
      <PageContainer className="space-y-4">
        <div role="group" aria-label={t('title')} className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="tiny"
              variant={status === f ? 'primary' : 'ghost'}
              aria-pressed={status === f}
              onClick={() => setStatus(f)}
            >
              {t(`filters.${f}`)}
            </Button>
          ))}
        </div>
        {error ? <Callout variant="destructive">{errorText(all, error)}</Callout> : null}
        {items.length === 0 && !tasks.isPending ? (
          <EmptyState
            icon={<ListChecks />}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>
                  <span className="sr-only">{t('columns.done')}</span>
                </TH>
                <TH>{t('columns.title')}</TH>
                <TH>{t('columns.contact')}</TH>
                <TH>{t('columns.assignee')}</TH>
                <TH>{t('columns.due')}</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((task) => (
                <TR key={task.id}>
                  <TD className="w-8">
                    <button
                      type="button"
                      disabled={!canWrite || toggle.isPending}
                      aria-label={task.completedAt ? t('markPending') : t('markDone')}
                      aria-pressed={task.completedAt !== null}
                      onClick={() => toggle.mutate(task)}
                      className={cn(
                        'size-4 rounded-sm border',
                        task.completedAt ? 'border-brand bg-brand' : 'border-border-control',
                      )}
                    />
                  </TD>
                  <TD>
                    <Link
                      href={`/tasks/${task.id}`}
                      className={cn(
                        task.completedAt
                          ? 'text-foreground-muted line-through'
                          : 'text-foreground hover:underline',
                      )}
                    >
                      {task.title}
                    </Link>
                  </TD>
                  <TD className="text-foreground-lighter">
                    {task.contact ? (
                      <Link href={`/contacts/${task.contact.id}`} className="hover:underline">
                        {task.contact.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD className="text-foreground-lighter">{task.assignee?.name ?? '—'}</TD>
                  <TD className="text-foreground-lighter">
                    {task.dueDate
                      ? format.dateTime(new Date(task.dueDate), {
                          dateStyle: 'medium',
                          timeZone: 'UTC',
                        })
                      : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </PageContainer>
      {creating ? <NewTaskPanel onClose={() => setCreating(false)} /> : null}
    </>
  )
}

function NewTaskPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations('tasks')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const qc = useQueryClient()
  const formId = 'new-task-form'
  const create = useMutation({
    mutationFn: async (body: ReturnType<typeof readTaskForm>) =>
      unwrap(await apiClient.POST('/api/v1/tasks', { body })),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKeys.all(orgId) })
      onClose()
    },
  })

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    create.mutate(readTaskForm(new FormData(e.currentTarget)))
  }

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('newTitle')}
      closeLabel={all('shell.close')}
      footer={
        <>
          <Button onClick={onClose}>{all('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" disabled={create.isPending}>
            {t('create')}
          </Button>
        </>
      }
    >
      <form id={formId} className="space-y-6" onSubmit={onSubmit}>
        {create.error ? (
          <Callout variant="destructive">{errorText(all, create.error)}</Callout>
        ) : null}
        <TaskFields autoFocus />
      </form>
    </SidePanel>
  )
}
