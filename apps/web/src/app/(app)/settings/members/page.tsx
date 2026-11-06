import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MembersSettings } from '@/features/settings/members.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('settings.members.title') }
}

export default function Page() {
  return <MembersSettings />
}
