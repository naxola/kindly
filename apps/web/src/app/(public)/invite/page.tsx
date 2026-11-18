import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { InvitationScreen } from '@/features/invitations/invitation-screen.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('invite.title') }
}

export default function Page() {
  return (
    <Suspense>
      <InvitationScreen />
    </Suspense>
  )
}
