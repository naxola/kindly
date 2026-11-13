import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { FICHA_COOKIE } from '@/features/inbox/ficha-preference.ts'
import { InboxWorkspace } from '@/features/inbox/inbox-workspace.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('inbox.title') }
}

export default async function Page() {
  // Whether the ficha is folded is remembered in a cookie, so the first paint is already right.
  const collapsed = (await cookies()).get(FICHA_COOKIE)?.value === '1'
  // The screen keeps its state in the URL (useSearchParams needs a Suspense boundary).
  return (
    <Suspense>
      <InboxWorkspace initialFichaCollapsed={collapsed} />
    </Suspense>
  )
}
