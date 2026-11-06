import type { Metadata } from 'next'
import { PageContainer, PageHeader } from '@saas/ui/shell'
import { getTranslations } from 'next-intl/server'
import { getWorkspace } from '@/server/viewer.ts'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('home'))('title') }
}

/** Home of the product. Each product replaces it with its own dashboard. */
export default async function Page() {
  const t = await getTranslations('home')
  const workspace = await getWorkspace()
  return (
    <>
      <PageHeader
        title={t('greeting', { name: workspace?.user?.displayName ?? '' })}
        description={t('organization', { organization: workspace?.active?.name ?? '' })}
      />
      <PageContainer>
        <p className="text-sm text-foreground-lighter">{t('empty')}</p>
      </PageContainer>
    </>
  )
}
