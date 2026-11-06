import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Suspense } from 'react'
import { ForgotPasswordForm } from '@/features/auth/recovery-forms.tsx'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations())('auth.forgot.title') }
}

export default function Page() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  )
}
