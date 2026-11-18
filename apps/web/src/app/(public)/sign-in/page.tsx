import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SignInForm } from '@/features/auth/sign-in-form.tsx'
import { safeNext } from '@/client/auth.ts'
import { getViewer } from '@/server/viewer.ts'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('auth.signIn.title') }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const viewer = await getViewer()
  if (viewer) redirect(safeNext((await searchParams).next))
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}
