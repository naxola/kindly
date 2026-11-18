import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'
import NextLink from 'next/link'
import { content } from '@/content.ts'
import type { Locale } from '@/i18n/routing.ts'
import { localized } from '@/metadata.ts'

type Props = { params: Promise<{ locale: Locale }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale })
  return {
    title: t('blog.title'),
    description: t('blog.description'),
    ...localized(locale, '/blog'),
  }
}

export default async function Blog({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })
  const posts = await content.listPosts(locale)
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl text-foreground">{t('blog.title')}</h1>
      <p className="mt-2 text-foreground-light">{t('blog.description')}</p>
      {posts.length === 0 ? (
        <p className="mt-10 text-foreground-lighter">{t('blog.empty')}</p>
      ) : (
        <ul className="mt-10 divide-y divide-border">
          {posts.map((post) => (
            <li key={post.slug} className="py-6">
              <article>
                <h2 className="text-xl text-foreground">
                  <NextLink href={`/${locale}/blog/${post.slug}`} className="hover:underline">
                    {post.title}
                  </NextLink>
                </h2>
                <p className="mt-1 text-xs text-foreground-lighter">
                  <time dateTime={post.date}>
                    {format.dateTime(new Date(post.date), { dateStyle: 'long' })}
                  </time>
                  {' · '}
                  {t('blog.readingTime', { minutes: post.readingMinutes })}
                </p>
                <p className="mt-2 text-sm text-foreground-light">{post.description}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
