import { getTranslations } from 'next-intl/server'
import { ImageResponse } from 'next/og'
import { LOCALES, type Locale } from '@/i18n/routing.ts'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }))

/** Default social card: product name and tagline on the brand colour. */
export default async function Image({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: '#171717',
        color: '#ededed',
      }}
    >
      <div style={{ fontSize: 36, color: '#7b93f5' }}>{t('site.name')}</div>
      <div style={{ fontSize: 64, marginTop: 24, lineHeight: 1.1 }}>{t('site.tagline')}</div>
    </div>,
    size,
  )
}
