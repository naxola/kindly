import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { OrganizationSettings } from '@/features/settings/organization.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('settings.organization.title') }
}

export default function Page() {
  return <OrganizationSettings />
}
