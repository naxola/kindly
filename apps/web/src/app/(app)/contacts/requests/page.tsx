import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { RequestsScreen } from '@/features/intake/requests-screen.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('intake.title') }
}

export default function Page() {
  return <RequestsScreen />
}
