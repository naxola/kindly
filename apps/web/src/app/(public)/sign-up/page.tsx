import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SignUpForm } from '@/features/auth/sign-up-form.tsx'
import { safeNext } from '@/client/auth.ts'
import { getViewer } from '@/server/viewer.ts'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('auth.signUp.title') }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const viewer = await getViewer()
  if (viewer) redirect(safeNext((await searchParams).next))
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  )
}
