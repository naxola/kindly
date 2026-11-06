import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { Logo } from '@/components/logo.tsx'
import { PreferencesMenu } from '@/components/preferences-menu.tsx'
import { SignOutButton } from '@/components/sign-out-button.tsx'
import { getViewer } from '@/server/viewer.ts'

/**
 * Signed-in area. Navigation only reflects permissions; security is enforced by the API in
 * every use case. The full shell (organization picker, navigation) arrives in phase 4b.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer()
  if (!viewer) redirect('/sign-in')
  const t = await getTranslations('app')
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-12 items-center justify-between border-b border-border bg-background-alt px-3">
        <Logo name={t('name')} />
        <div className="flex items-center gap-1">
          <PreferencesMenu />
          <SignOutButton />
        </div>
      </header>
      <main id="main" className="flex-1 px-4 py-10">
        {children}
      </main>
    </div>
  )
}
