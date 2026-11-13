import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { OnboardingPaths } from '@/features/channels/onboarding.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('channels.onboarding.pathsTitle') }
}

export default async function Page({ params }: { params: Promise<{ channel: string }> }) {
  const { channel } = await params
  return <OnboardingPaths channel={channel} />
}
