'use client'

import { toast } from '@saas/ui'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'
import { useCan, useOrganizationId } from '@/components/workspace-context.tsx'
import { useAffiliateRequestCount } from './queries.ts'

const seenKey = (orgId: string) => `kindly.intake.seen.${orgId}`

/**
 * Lets an administrator know, anywhere in the app, that altas are waiting: one notice each time
 * the number goes up (remembered for the browser session), not on the Altas page itself. Renders
 * nothing.
 */
export function RequestsNotifier() {
  const t = useTranslations('intake')
  const orgId = useOrganizationId()
  const canManage = useCan()('affiliate_requests.manage')
  const pathname = usePathname()
  const router = useRouter()
  const count = useAffiliateRequestCount(orgId, canManage)
  const open = count.data

  useEffect(() => {
    if (open === undefined) return
    let seen = 0
    try {
      seen = Number(sessionStorage.getItem(seenKey(orgId)) ?? 0)
    } catch {
      // Storage blocked: notify, and do not remember.
    }
    const remember = () => {
      try {
        sessionStorage.setItem(seenKey(orgId), String(open))
      } catch {
        // Storage blocked: nothing to remember.
      }
    }
    if (open <= seen || pathname.startsWith('/contacts/requests')) {
      remember()
      return
    }
    remember()
    toast(t('notice', { count: open }), {
      action: { label: t('review'), onClick: () => router.push('/contacts/requests') },
    })
  }, [open, orgId, pathname, router, t])

  return null
}
