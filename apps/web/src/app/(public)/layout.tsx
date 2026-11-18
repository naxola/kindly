import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { Logo } from '@/components/logo.tsx'
import { PreferencesMenu } from '@/components/preferences-menu.tsx'

/** Screens outside the application shell: access, invitation, onboarding and account. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('app')
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-12 items-center justify-between border-b border-border bg-background-alt px-3">
        <Logo name={t('name')} />
        <PreferencesMenu />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-12 sm:py-20">
        {children}
      </main>
    </div>
  )
}
