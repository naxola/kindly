import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DocumentDetail } from '@/features/knowledge/document-detail.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('knowledge.title') }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DocumentDetail documentId={id} />
}
