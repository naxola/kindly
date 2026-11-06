import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getViewer } from '@/server/viewer.ts'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('home'))('title') }
}

export default async function Page() {
  const t = await getTranslations('home')
  const viewer = await getViewer()
  return (
    <div className="mx-auto max-w-2xl space-y-2">
      <h1 className="text-2xl text-foreground">{t('title')}</h1>
      <p className="text-sm text-foreground-light">
        {t('signedInAs', { email: viewer?.email ?? '' })}
      </p>
      <p className="text-sm text-foreground-lighter">{t('next')}</p>
    </div>
  )
}
