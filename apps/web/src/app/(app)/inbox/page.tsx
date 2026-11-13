import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { InboxList } from '@/features/inbox/inbox-list.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('inbox.title') }
}

export default function Page() {
  // The list keeps its filters in the URL (useSearchParams needs a Suspense boundary).
  return (
    <Suspense>
      <InboxList />
    </Suspense>
  )
}
