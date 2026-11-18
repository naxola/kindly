'use client'

import { Button, Callout } from '@saas/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { apiClient } from '@/client/api.ts'
import { errorText, unwrap } from '@/client/errors.ts'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { inboxKeys } from '../inbox/queries.ts'
import { contactKeys } from './queries.ts'

/**
 * A contact Kindly created from an unknown sender: whoever may edit it confirms it is who it seems
 * to be. (Merging it into an existing contact is a separate step, not here yet.)
 */
export function UnidentifiedNotice({ contactId }: { contactId: string }) {
  const t = useTranslations('contacts.identify')
  const all = useTranslations()
  const orgId = useOrganizationId()
  const canWrite = useCan()('contacts.write')
  const qc = useQueryClient()
  const identify = useMutation({
    mutationFn: async () =>
      unwrap(
        await apiClient.POST('/api/v1/contacts/{id}/identified', {
          params: { path: { id: contactId } },
        }),
      ),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: contactKeys.all(orgId) }),
        qc.invalidateQueries({ queryKey: inboxKeys.all(orgId) }),
      ]),
  })
  return (
    <Callout variant="warning">
      <p>{t('notice')}</p>
      {identify.error ? <p className="text-destructive">{errorText(all, identify.error)}</p> : null}
      {canWrite ? (
        <Button className="mt-2" disabled={identify.isPending} onClick={() => identify.mutate()}>
          {t('action')}
        </Button>
      ) : null}
    </Callout>
  )
}
