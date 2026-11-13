import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { CoexistenceChecklist } from '@/features/channels/onboarding.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('channels.onboarding.preflightTitle') }
}

export default async function Page({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params
  return <CoexistenceChecklist channel={channel} />
}
