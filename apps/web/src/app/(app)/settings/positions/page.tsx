import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { PositionsSettings } from '@/features/settings/positions.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('settings.positions.title') }
}

export default function Page() {
  return <PositionsSettings />
}
