import { buttonVariants, cn } from '@saas/ui'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Locale } from '@/i18n/routing.ts'
import { localized } from '@/metadata.ts'
import { site } from '@/site.config.ts'

type Props = { params: Promise<{ locale: Locale }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return {
    title: t('pricing.title'),
    description: t('pricing.description'),
    ...localized(locale, '/pricing'),
  }
}

/**
 * Plans come from site.config.ts (prices) and messages (names and features). Without
 * plans, it says so and offers contact: no invented prices.
 */
export default async function Pricing({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale })
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-3xl text-foreground">{t('pricing.title')}</h1>
      <p className="mt-2 text-foreground-light">{t('pricing.description')}</p>
      {site.plans.length === 0 ? (
        <div className="mt-10 rounded-lg border border-border bg-surface-100 p-8">
          <p className="text-foreground">{t('pricing.comingSoon')}</p>
          <p className="mt-2 text-sm text-foreground-light">
            {t('pricing.contact', { email: site.legal.email })}
          </p>
        </div>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {site.plans.map((plan) => (
            <li
              key={plan.key}
              className={cn(
                'flex flex-col rounded-lg border bg-surface-100 p-6',
                plan.featured ? 'border-brand' : 'border-border',
              )}
            >
              {plan.featured ? (
                <span className="mb-2 text-xs text-brand">{t('pricing.featured')}</span>
              ) : null}
              <h2 className="text-lg text-foreground">{t(`pricing.plans.${plan.key}.name`)}</h2>
              <p className="mt-2 text-2xl text-foreground">{plan.price}</p>
              <p className="mt-3 flex-1 text-sm text-foreground-light">
                {t(`pricing.plans.${plan.key}.description`)}
              </p>
              <a
                className={cn(
                  buttonVariants({ variant: plan.featured ? 'primary' : 'default', size: 'small' }),
                  'mt-6',
                )}
                href={`${site.appUrl}/sign-up`}
              >
                {t('pricing.choose')}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
