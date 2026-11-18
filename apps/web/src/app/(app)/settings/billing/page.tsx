import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { BillingSettings } from '@/features/settings/billing.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('settings.billing.title') }
}

export default function Page() {
  return <BillingSettings />
}
