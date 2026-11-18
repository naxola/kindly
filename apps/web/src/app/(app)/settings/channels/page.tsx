import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ChannelsScreen } from '@/features/channels/channels-screen.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('channels.title') }
}

export default function Page() {
  return <ChannelsScreen />
}
