import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ActivitySettings } from '@/features/settings/activity.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('settings.activity.title') }
}

export default function Page() {
  return <ActivitySettings />
}
