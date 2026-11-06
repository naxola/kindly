'use client'

import { Button } from '@saas/ui'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { authRequest } from '@/client/auth.ts'

export function SignOutButton() {
  const t = useTranslations('shell')
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    await authRequest('/sign-out', {})
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <Button size="small" variant="default" disabled={pending} onClick={() => void signOut()}>
      {t('signOut')}
    </Button>
  )
}
