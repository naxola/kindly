'use client'

import { Field, Input, Select, Textarea } from '@saas/ui'
import { useTranslations } from 'next-intl'
import { field } from '@/client/forms.ts'
import { useMembers } from '@/client/queries.ts'
import { useContacts } from '@/features/contacts/queries.ts'
import { useOrganizationId } from '@/components/workspace-context.tsx'

interface Task {
  title: string
  description: string | null
  dueDate: string | null
  contact: { id: string } | null
  assignee: { memberId: string } | null
}

export interface TaskFormValues {
  title: string
  description: string
  contactId: string | null
  assigneeId: string | null
  dueDate: string
}

/** The editable fields of a task, shared by the creation panel and the detail page. */
export function TaskFields({ task, autoFocus = false }: { task?: Task; autoFocus?: boolean }) {
  const t = useTranslations('tasks')
  const orgId = useOrganizationId()
  // Only the contacts the person may see are offered; the assignees are the active members.
  const contacts = useContacts(orgId)
  const members = useMembers(orgId)
  return (
    <>
      <Field label={t('fields.title')}>
        {(p) => (
          <Input
            {...p}
            name="title"
            required
            maxLength={200}
            autoFocus={autoFocus}
            defaultValue={task?.title ?? ''}
          />
        )}
      </Field>
      <Field label={t('fields.contact')}>
        {(p) => (
          <Select {...p} name="contactId" defaultValue={task?.contact?.id ?? ''}>
            <option value="">{t('none.contact')}</option>
            {(contacts.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('fields.assignee')}>
        {(p) => (
          <Select {...p} name="assigneeId" defaultValue={task?.assignee?.memberId ?? ''}>
            <option value="">{t('none.assignee')}</option>
            {(members.data ?? [])
              .filter((m) => m.status === 'ACTIVE')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
          </Select>
        )}
      </Field>
      <Field label={t('fields.due')}>
        {(p) => (
          <Input
            {...p}
            name="dueDate"
            type="date"
            defaultValue={task?.dueDate?.slice(0, 10) ?? ''}
          />
        )}
      </Field>
      <Field label={t('fields.description')}>
        {(p) => (
          <Textarea
            {...p}
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={task?.description ?? ''}
          />
        )}
      </Field>
    </>
  )
}

export function readTaskForm(form: FormData): TaskFormValues {
  return {
    title: field(form, 'title').trim(),
    description: field(form, 'description').trim(),
    contactId: field(form, 'contactId') || null,
    assigneeId: field(form, 'assigneeId') || null,
    dueDate: field(form, 'dueDate'),
  }
}
