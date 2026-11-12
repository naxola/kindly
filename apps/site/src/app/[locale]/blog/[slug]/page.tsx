import { renderMdx } from '@saas/content'
import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'
import NextLink from 'next/link'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld.tsx'
import { proseComponents } from '@/components/prose.tsx'
import { content } from '@/content.ts'
import { LOCALES, type Locale } from '@/i18n/routing.ts'
import { site } from '@/site.config.ts'

type Props = { params: Promise<{ locale: Locale; slug: string }> }

export const dynamicParams = false

export async function generateStaticParams() {
  const all = await Promise.all(
    LOCALES.map(async (locale) =>
      (await content.listPosts(locale)).map((p) => ({ locale, slug: p.slug })),
    ),
  )
  return all.flat()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params
  const post = await content.getPost(locale, slug)
  if (!post) return {}
  // A post may exist only in one locale: hreflang only lists those that exist.
  const languages: Record<string, string> = {}
  for (const l of LOCALES) {
    if (await content.getPost(l, slug)) languages[l] = `${site.url}/${l}/blog/${slug}`
  }
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `${site.url}/${locale}/blog/${slug}`, languages },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      ...(post.updated ? { modifiedTime: post.updated } : {}),
      ...(post.author ? { authors: [post.author] } : {}),
      tags: post.tags,
    },
  }
}

export default async function PostPage({ params }: Props) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const post = await content.getPost(locale, slug)
  if (!post) notFound()
  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const body = await renderMdx(post.body, { components: proseComponents })
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <NextLink
        href={`/${locale}/blog`}
        className="text-sm text-foreground-lighter hover:text-foreground"
      >
        ← {t('blog.back')}
      </NextLink>
      <h1 className="mt-6 text-4xl text-balance text-foreground">{post.title}</h1>
      <p className="mt-3 text-sm text-foreground-lighter">
        <time dateTime={post.date}>
          {format.dateTime(new Date(post.date), { dateStyle: 'long' })}
        </time>
        {post.author ? ` · ${t('blog.by', { author: post.author })}` : null}
        {' · '}
        {t('blog.readingTime', { minutes: post.readingMinutes })}
      </p>
      <div className="mt-8">{body}</div>
      {post.updated ? (
        <p className="mt-10 text-xs text-foreground-lighter">
          {t('blog.updated', {
            date: format.dateTime(new Date(post.updated), { dateStyle: 'long' }),
          })}
        </p>
      ) : null}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          ...(post.updated ? { dateModified: post.updated } : {}),
          ...(post.author ? { author: { '@type': 'Person', name: post.author } } : {}),
          inLanguage: locale,
          mainEntityOfPage: `${site.url}/${locale}/blog/${slug}`,
        }}
      />
    </article>
  )
}
