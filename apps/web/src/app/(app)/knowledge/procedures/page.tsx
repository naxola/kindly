import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ProceduresScreen } from '@/features/procedures/procedures-screen.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('procedures.title') }
}

export default function Page() {
  return <ProceduresScreen />
}
