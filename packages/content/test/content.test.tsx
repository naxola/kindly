import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { ContentError, fileContentSource, renderMdx } from '../src/index.ts'

let root: string
const write = (path: string, content: string) => {
  const full = join(root, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const post = (fm: Record<string, unknown>, body = 'Texto del post.') =>
  `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')}\n---\n\n${body}\n`

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('file content source', () => {
  it('lists published posts of a locale, newest first, with reading time', async () => {
    root = mkdtempSync(join(tmpdir(), 'content-'))
    write('blog/es/viejo.mdx', post({ title: 'Viejo', description: 'd', date: '2026-01-01' }))
    write(
      'blog/es/nuevo.mdx',
      post({ title: 'Nuevo', description: 'd', date: '2026-10-01' }, 'palabra '.repeat(500)),
    )
    write(
      'blog/es/borrador.mdx',
      post({ title: 'B', description: 'd', date: '2026-11-01', draft: true }),
    )
    write('blog/en/other.mdx', post({ title: 'Other', description: 'd', date: '2026-10-02' }))
    const source = fileContentSource({ root })
    const posts = await source.listPosts('es')
    expect(posts.map((p) => p.slug)).toEqual(['nuevo', 'viejo'])
    expect(posts[0]).toMatchObject({ title: 'Nuevo', locale: 'es', tags: [], readingMinutes: 2 })
    expect(posts[0]).not.toHaveProperty('body')
    expect(await source.getPost('es', 'borrador')).toBeNull()
    expect((await fileContentSource({ root, includeDrafts: true }).listPosts('es')).length).toBe(3)
  })

  it('returns a post with its body, and null for unknown or unsafe slugs', async () => {
    root = mkdtempSync(join(tmpdir(), 'content-'))
    write(
      'blog/es/hola.mdx',
      post({ title: 'Hola', description: 'd', date: '2026-10-01' }, '# Título'),
    )
    const source = fileContentSource({ root })
    expect((await source.getPost('es', 'hola'))?.body).toBe('# Título')
    expect(await source.getPost('es', 'nope')).toBeNull()
    expect(await source.getPost('es', '../../etc/passwd')).toBeNull()
    expect(await source.getPost('en', 'hola')).toBeNull()
  })

  it('stops with the file and the reason when content is invalid', async () => {
    root = mkdtempSync(join(tmpdir(), 'content-'))
    write('blog/es/mal.mdx', post({ description: 'sin título', date: '2026-13-45' }))
    const promise = fileContentSource({ root }).listPosts('es')
    await expect(promise).rejects.toBeInstanceOf(ContentError)
    await expect(promise).rejects.toThrow(/mal\.mdx.*title/)
    write('blog/es/mal.mdx', 'sin cabecera')
    await expect(fileContentSource({ root }).listPosts('es')).rejects.toThrow(/missing frontmatter/)
  })

  it('reads standalone pages of a collection', async () => {
    root = mkdtempSync(join(tmpdir(), 'content-'))
    write('legal/es/privacy.mdx', '---\ntitle: Privacidad\n---\nTexto')
    const page = await fileContentSource({ root }).getPage('es', 'legal', 'privacy')
    expect(page).toMatchObject({ title: 'Privacidad', slug: 'privacy', body: 'Texto' })
    expect(await fileContentSource({ root }).getPage('es', 'legal', 'missing')).toBeNull()
  })
})

describe('renderMdx', () => {
  it('renders markdown with GFM tables and fills variables', async () => {
    root = mkdtempSync(join(tmpdir(), 'content-'))
    const element = await renderMdx('# {{company}}\n\n| a | b |\n|---|---|\n| 1 | 2 |', {
      variables: { company: 'Acme S.L.' },
    })
    const html = renderToStaticMarkup(element)
    expect(html).toContain('<h1>Acme S.L.</h1>')
    expect(html).toContain('<table>')
    // A missing value stops the build instead of publishing a hole.
    await expect(renderMdx('Hola {{unknown}}')).rejects.toThrow('Missing content variable: unknown')
  })

  it('uses the given components', async () => {
    root = mkdtempSync(join(tmpdir(), 'content-'))
    const element = await renderMdx('## Sección', {
      components: { h2: (props) => <h2 className="custom" {...props} /> },
    })
    expect(renderToStaticMarkup(element)).toBe('<h2 class="custom">Sección</h2>')
  })
})
