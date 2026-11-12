import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { Onboarding } from '@/features/onboarding/onboarding.tsx'
import { getWorkspace } from '@/server/viewer.ts'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('onboarding.title') }
}

/** Without an active organization: choose one of one's own or create one. */
export default async function Page({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const workspace = await getWorkspace()
  if (!workspace) redirect('/sign-in?next=/onboarding')
  // Already inside, unless they asked to create another organization.
  if (workspace.active && !(await searchParams).new) redirect('/')
  return (
    <Onboarding organizations={workspace.organizations.map((o) => ({ id: o.id, name: o.name }))} />
  )
}
