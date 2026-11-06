import { getTranslations } from 'next-intl/server'
import { ImageResponse } from 'next/og'
import { content } from '@/content.ts'
import { LOCALES, type Locale } from '@/i18n/routing.ts'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export async function generateStaticParams() {
  const all = await Promise.all(
    LOCALES.map(async (locale) =>
      (await content.listPosts(locale)).map((p) => ({ locale, slug: p.slug })),
    ),
  )
  return all.flat()
}

/** Social card of a post: its title, generated at build time. */
export default async function Image({
  params,
}: {
  params: Promise<{ locale: Locale; slug: string }>
}) {
  const { locale, slug } = await params
  const t = await getTranslations({ locale })
  const post = await content.getPost(locale, slug)
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 80,
        background: '#171717',
        color: '#ededed',
      }}
    >
      <div style={{ fontSize: 32, color: '#7b93f5' }}>{t('site.name')}</div>
      <div style={{ fontSize: 68, lineHeight: 1.1 }}>{post?.title ?? ''}</div>
      <div style={{ fontSize: 28, color: '#8f8f8f' }}>{t('blog.title')}</div>
    </div>,
    size,
  )
}
