import { getTranslations } from 'next-intl/server'
import { content } from '@/content.ts'
import { isLocale, LOCALES } from '@/i18n/routing.ts'
import { site } from '@/site.config.ts'

export const dynamic = 'force-static'
export const dynamicParams = false
export const generateStaticParams = () => LOCALES.map((locale) => ({ locale }))

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** RSS 2.0 feed of a locale, built with the site. */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) return new Response('Not found', { status: 404 })
  const t = await getTranslations({ locale })
  const posts = await content.listPosts(locale)
  const items = posts
    .map((p) => {
      const url = `${site.url}/${locale}/blog/${p.slug}`
      return `    <item>
      <title>${xml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${xml(p.description)}</description>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    </item>`
    })
    .join('\n')
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(`${t('blog.title')} · ${t('site.name')}`)}</title>
    <link>${site.url}/${locale}/blog</link>
    <description>${xml(t('blog.description'))}</description>
    <language>${locale}</language>
    <atom:link href="${site.url}/${locale}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
}
