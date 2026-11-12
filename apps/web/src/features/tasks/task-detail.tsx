'use client'

import { Button, Callout, Checkbox, EmptyState, Panel } from '@saas/ui'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ListX } from 'lucide-react'
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import type { FormEvent } from 'react'
import { apiClient } from '@/client/api.ts'
import { ApiError, errorText, unwrap } from '@/client/errors.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { taskKeys, useTask, useTaskActivity } from './queries.ts'
import { readTaskForm, TaskFields } from './task-fields.tsx'

/** A task: its data and completion, and its timeline. */
export function TaskDetail({ taskId }: { taskId: string }) {
  const t = useTranslations('tasks')
  const all = useTranslations()
  const format = useFormatter()
  const orgId = useOrganizationId()
  const canWrite = useCan()('tasks.write')
  const qc = useQueryClient()
  const task = useTask(orgId, taskId)
  const activity = useTaskActivity(orgId, taskId)

  const save = useMutation({
    mutationFn: async (body: ReturnType<typeof readTaskForm> & { completed: boolean }) =>
      unwrap(await apiClient.PUT('/api/v1/tasks/{id}', { params: { path: { id: taskId } }, body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all(orgId) }),
  })

  if (task.error) {
    const missing = task.error instanceof ApiError && task.error.status === 404
    return (
      <PageContainer>
        <EmptyState
          icon={<ListX />}
          title={missing ? t('notFound') : errorText(all, task.error)}
          action={
            <Button asChild>
              <Link href="/tasks">{t('back')}</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }
  const data = task.data
  if (!data) return null

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    save.mutate({ ...readTaskForm(form), completed: form.get('completed') === 'on' })
  }

  const events = activity.data ?? []
  return (
    <>
      <PageHeader title={data.title} />
      <PageContainer className="max-w-3xl space-y-6">
        <form onSubmit={onSubmit}>
          <Panel
            title={t('edit.title')}
            footer={
              canWrite ? (
                <Button type="submit" variant="primary" disabled={save.isPending}>
                  {t('save')}
                </Button>
              ) : null
            }
          >
            {save.error ? (
              <Callout variant="destructive">{errorText(all, save.error)}</Callout>
            ) : null}
            {/* Fresh defaults after each save or reload of the task. */}
            <div key={data.updatedAt} className="space-y-4">
              <TaskFields task={data} />
              <Checkbox
                name="completed"
                label={t('fields.completed')}
                defaultChecked={data.completedAt !== null}
              />
            </div>
          </Panel>
        </form>
        <Panel title={t('activity.title')}>
          {events.length === 0 ? (
            <p className="text-sm text-foreground-lighter">{t('activity.empty')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-foreground">
                    {t.has(`activity.types.${a.type}`) ? t(`activity.types.${a.type}`) : a.type}
                    {a.actorName ? (
                      <span className="text-foreground-lighter">
                        {' '}
                        · {t('activity.by', { name: a.actorName })}
                      </span>
                    ) : null}
                  </span>
                  <time dateTime={a.createdAt} className="shrink-0 text-xs text-foreground-lighter">
                    {format.dateTime(new Date(a.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </PageContainer>
    </>
  )
}
