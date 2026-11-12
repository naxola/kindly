import { buttonVariants } from '@saas/ui'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import NextLink from 'next/link'
import { JsonLd } from '@/components/json-ld.tsx'
import type { Locale } from '@/i18n/routing.ts'
import { localized } from '@/metadata.ts'
import { site } from '@/site.config.ts'

const FEATURES = ['one', 'two', 'three'] as const
const FAQ = ['one', 'two', 'three'] as const

type Props = { params: Promise<{ locale: Locale }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  return localized(locale)
}

/** Landing: hero, benefits, FAQ and call to action. The copy lives in messages/. */
export default async function Home({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale })
  return (
    <>
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:py-28">
        <h1 className="text-4xl text-balance text-foreground sm:text-5xl">{t('home.title')}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-balance text-foreground-light">
          {t('home.subtitle')}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <a
            className={buttonVariants({ variant: 'primary', size: 'medium' })}
            href={`${site.appUrl}/sign-up`}
          >
            {t('home.primaryCta')}
          </a>
          <NextLink className={buttonVariants({ size: 'medium' })} href={`/${locale}/pricing`}>
            {t('home.secondaryCta')}
          </NextLink>
        </div>
      </section>

      <section className="border-y border-border bg-background-alt">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-2xl text-foreground">{t('home.featuresTitle')}</h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-3">
            {FEATURES.map((key) => (
              <li key={key} className="rounded-lg border border-border bg-surface-100 p-6">
                <h3 className="text-base text-foreground">{t(`home.features.${key}.title`)}</h3>
                <p className="mt-2 text-sm text-foreground-light">
                  {t(`home.features.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16">
        <h2 className="text-2xl text-foreground">{t('home.faqTitle')}</h2>
        <dl className="mt-6 divide-y divide-border">
          {FAQ.map((key) => (
            <div key={key} className="py-5">
              <dt className="text-foreground">{t(`home.faq.${key}.q`)}</dt>
              <dd className="mt-2 text-sm text-foreground-light">{t(`home.faq.${key}.a`)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-border bg-background-alt">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-2xl text-foreground">{t('home.ctaTitle')}</h2>
          <p className="mt-2 text-foreground-light">{t('home.ctaBody')}</p>
          <a
            className={`${buttonVariants({ variant: 'primary', size: 'medium' })} mt-6`}
            href={`${site.appUrl}/sign-up`}
          >
            {t('home.primaryCta')}
          </a>
        </div>
      </section>

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: t('site.name'),
          description: t('site.tagline'),
          applicationCategory: 'BusinessApplication',
          url: `${site.url}/${locale}`,
        }}
      />
    </>
  )
}
