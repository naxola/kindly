import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { KnowledgeScreen } from '@/features/knowledge/knowledge-screen.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('knowledge.title') }
}

export default function Page() {
  // The search lives in the URL (useSearchParams needs a Suspense boundary).
  return (
    <Suspense>
      <KnowledgeScreen />
    </Suspense>
  )
}
