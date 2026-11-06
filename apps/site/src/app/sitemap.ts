import type { MetadataRoute } from 'next'
import { LEGAL_DOCS } from '@/components/site-footer.tsx'
import { content } from '@/content.ts'
import { LOCALES } from '@/i18n/routing.ts'
import { site } from '@/site.config.ts'

/** Every prerendered page, in every locale, with its hreflang alternates. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const alternates = (path: string) => ({
    languages: Object.fromEntries(LOCALES.map((l) => [l, `${site.url}/${l}${path}`])),
  })
  const pages = [
    '',
    '/pricing',
    '/blog',
    ...(site.legal.reviewed ? LEGAL_DOCS.map((d) => `/legal/${d}`) : []),
  ]
  const entries: MetadataRoute.Sitemap = LOCALES.flatMap((locale) =>
    pages.map((path) => ({ url: `${site.url}/${locale}${path}`, alternates: alternates(path) })),
  )
  for (const locale of LOCALES) {
    for (const post of await content.listPosts(locale)) {
      entries.push({
        url: `${site.url}/${locale}/blog/${post.slug}`,
        lastModified: post.updated ?? post.date,
      })
    }
  }
  return entries
}
