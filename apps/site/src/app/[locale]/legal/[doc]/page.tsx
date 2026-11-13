import { renderMdx } from '@saas/content'
import { Callout } from '@saas/ui'
import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { proseComponents } from '@/components/prose.tsx'
import { LEGAL_DOCS } from '@/components/site-footer.tsx'
import { content } from '@/content.ts'
import { LOCALES, type Locale } from '@/i18n/routing.ts'
import { localized } from '@/metadata.ts'
import { site } from '@/site.config.ts'

type Props = { params: Promise<{ locale: Locale; doc: string }> }

export const dynamicParams = false
export const generateStaticParams = () =>
  LOCALES.flatMap((locale) => LEGAL_DOCS.map((doc) => ({ locale, doc })))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, doc } = await params
  const page = await content.getPage(locale, 'legal', doc)
  if (!page) return {}
  return {
    title: page.title,
    ...localized(locale, `/legal/${doc}`),
    // Unreviewed templates are not indexed.
    ...(site.legal.reviewed ? {} : { robots: { index: false } }),
  }
}

/** Legal pages: texts in content/legal, filled with the company data of site.config.ts. */
export default async function LegalPage({ params }: Props) {
  const { locale, doc } = await params
  setRequestLocale(locale)
  const page = await content.getPage(locale, 'legal', doc)
  if (!page) notFound()
  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const body = await renderMdx(page.body, {
    components: proseComponents,
    variables: {
      companyName: site.legal.companyName,
      taxId: site.legal.taxId,
      address: site.legal.address,
      email: site.legal.email,
      privacyEmail: site.legal.privacyEmail,
      registryDetails: site.legal.registryDetails,
      productName: t('site.name'),
      siteUrl: site.url,
      appUrl: site.appUrl,
    },
  })
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      {site.legal.reviewed ? null : <Callout variant="warning">{t('legal.reviewWarning')}</Callout>}
      <h1 className="mt-6 text-3xl text-foreground">{page.title}</h1>
      {page.updated ? (
        <p className="mt-2 text-xs text-foreground-lighter">
          {t('legal.updated', {
            date: format.dateTime(new Date(page.updated), { dateStyle: 'long' }),
          })}
        </p>
      ) : null}
      <div className="mt-6">{body}</div>
    </article>
  )
}
