import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AccountSettings } from '@/features/settings/account.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('settings.account.title') }
}

export default function Page() {
  return <AccountSettings />
}
