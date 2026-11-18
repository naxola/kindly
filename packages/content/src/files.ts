import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import {
  ContentError,
  PageFrontmatter,
  PostFrontmatter,
  type ContentLocale,
  type ContentSource,
  type Page,
  type Post,
  type PostMeta,
} from './source.ts'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WORDS_PER_MINUTE = 220

function split(file: string, raw: string): { data: unknown; body: string } {
  const match = FRONTMATTER.exec(raw)
  if (!match) throw new ContentError(file, 'missing frontmatter (--- … ---)')
  try {
    return { data: parseYaml(match[1]!) as unknown, body: match[2]!.trim() }
  } catch (error) {
    throw new ContentError(file, `frontmatter is not valid YAML (${(error as Error).message})`)
  }
}

function validate<S extends z.ZodType>(schema: S, file: string, data: unknown): z.output<S> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new ContentError(file, issues.join('; '))
  }
  return result.data
}

const readingMinutes = (body: string) =>
  Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / WORDS_PER_MINUTE))

async function mdxFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.mdx')).sort()
  } catch {
    return []
  }
}

export interface FileContentSourceOptions {
  /** Folder with `blog/<locale>/*.mdx` and `<collection>/<locale>/*.mdx`. */
  root: string
  includeDrafts?: boolean
}

/** MDX files in the repository (ADR 0005). Publishing = commit + deploy of the site. */
export function fileContentSource({
  root,
  includeDrafts = false,
}: FileContentSourceOptions): ContentSource {
  async function readPost(locale: ContentLocale, fileName: string): Promise<Post> {
    const file = join(root, 'blog', locale, fileName)
    const slug = fileName.replace(/\.mdx$/, '')
    if (!SLUG.test(slug)) throw new ContentError(file, 'file name must be a lower-case slug')
    const { data, body } = split(file, await readFile(file, 'utf8'))
    const meta = validate(PostFrontmatter, file, data)
    return { ...meta, slug, locale, readingMinutes: readingMinutes(body), body }
  }

  return {
    async listPosts(locale) {
      const files = await mdxFiles(join(root, 'blog', locale))
      const posts = await Promise.all(files.map((f) => readPost(locale, f)))
      return posts
        .filter((p) => includeDrafts || !p.draft)
        .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
        .map(({ body: _body, ...meta }): PostMeta => meta)
    },

    async getPost(locale, slug) {
      if (!SLUG.test(slug)) return null
      const files = await mdxFiles(join(root, 'blog', locale))
      if (!files.includes(`${slug}.mdx`)) return null
      const post = await readPost(locale, `${slug}.mdx`)
      return post.draft && !includeDrafts ? null : post
    },

    async getPage(locale, collection, slug) {
      if (!SLUG.test(slug) || !SLUG.test(collection)) return null
      const files = await mdxFiles(join(root, collection, locale))
      if (!files.includes(`${slug}.mdx`)) return null
      const file = join(root, collection, locale, `${slug}.mdx`)
      const { data, body } = split(file, await readFile(file, 'utf8'))
      const meta = validate(PageFrontmatter, file, data)
      return { ...meta, slug, locale, body } satisfies Page
    },
  }
}
