import { evaluate } from '@mdx-js/mdx'
import type { MDXComponents } from 'mdx/types'
import type { ReactElement } from 'react'
import * as runtime from 'react/jsx-runtime'
import remarkGfm from 'remark-gfm'

/**
 * Renders MDX on the server (React Server Components or build time). MDX can run code:
 * only render content from the repository, which is reviewed like code. Content coming
 * from a CMS or users must not go through here (ADR 0005).
 *
 * `variables` replaces `{{name}}` placeholders before compiling (e.g. the company data of
 * the legal pages), so the same text serves every product. Unknown names throw.
 */
export async function renderMdx(
  source: string,
  {
    components,
    variables = {},
  }: { components?: MDXComponents; variables?: Record<string, string> } = {},
): Promise<ReactElement> {
  const filled = source.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    // A missing value stops the build instead of publishing a hole (e.g. in a legal page).
    if (!(name in variables)) throw new Error(`Missing content variable: ${name}`)
    return variables[name]!
  })
  const mdx = await evaluate(filled, { ...runtime, remarkPlugins: [remarkGfm] })
  const Content = mdx.default as (props: { components?: MDXComponents }) => ReactElement
  return Content({ components })
}
