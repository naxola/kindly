import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ProcedureDetail } from '@/features/procedures/procedure-detail.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('procedures.title') }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProcedureDetail procedureId={id} />
}
