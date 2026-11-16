import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { IntegrationsScreen } from '@/features/intake/integrations-screen.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('integrations.title') }
}

export default function Page() {
  return <IntegrationsScreen />
}
