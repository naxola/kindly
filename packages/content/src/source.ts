import { z } from 'zod'

/**
 * Where the public site reads its content from (ADR 0005). Pages only talk to this
 * interface: moving from MDX files to a CMS (Payload) means a new implementation, not
 * new pages.
 */
export const LOCALES = ['es', 'en'] as const
export type ContentLocale = (typeof LOCALES)[number]

export const PostFrontmatter = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(300),
  /** Publication date (YYYY-MM-DD). */
  date: z.iso.date(),
  updated: z.iso.date().optional(),
  author: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
  /** Drafts are only listed when `includeDrafts` is on (development). */
  draft: z.boolean().default(false),
})
export type PostFrontmatter = z.output<typeof PostFrontmatter>

export const PageFrontmatter = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(300).optional(),
  updated: z.iso.date().optional(),
})
export type PageFrontmatter = z.output<typeof PageFrontmatter>

export interface PostMeta extends PostFrontmatter {
  slug: string
  locale: ContentLocale
  readingMinutes: number
}

export interface Post extends PostMeta {
  /** MDX source, without the frontmatter. Render it with `renderMdx`. */
  body: string
}

export interface Page extends PageFrontmatter {
  slug: string
  locale: ContentLocale
  body: string
}

export interface ContentSource {
  /** Published posts of a locale, newest first. */
  listPosts(locale: ContentLocale): Promise<PostMeta[]>
  getPost(locale: ContentLocale, slug: string): Promise<Post | null>
  /** A standalone page of a collection (e.g. `legal/privacy`). */
  getPage(locale: ContentLocale, collection: string, slug: string): Promise<Page | null>
}

/** Invalid content stops the build with the file and the reason, never a broken page. */
export class ContentError extends Error {
  constructor(
    public readonly file: string,
    reason: string,
  ) {
    super(`Invalid content in ${file}: ${reason}`)
    this.name = 'ContentError'
  }
}
