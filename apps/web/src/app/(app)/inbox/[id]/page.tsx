import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ConversationView } from '@/features/inbox/conversation-view.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('inbox.title') }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ConversationView conversationId={id} />
}
