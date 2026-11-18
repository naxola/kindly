import type { MDXComponents } from 'mdx/types'

/**
 * Typography of posts and legal pages, with the design-system tokens (no extra plugin).
 * Products can add their own MDX components here (callouts, images, embeds…).
 */
export const proseComponents: MDXComponents = {
  h1: (p) => <h1 className="mt-10 mb-4 text-3xl text-foreground" {...p} />,
  h2: (p) => <h2 className="mt-10 mb-3 text-xl text-foreground" {...p} />,
  h3: (p) => <h3 className="mt-8 mb-2 text-lg text-foreground" {...p} />,
  p: (p) => <p className="my-4 leading-7 text-foreground-light" {...p} />,
  a: (p) => <a className="text-brand underline underline-offset-2" {...p} />,
  ul: (p) => <ul className="my-4 list-disc space-y-1 pl-6 text-foreground-light" {...p} />,
  ol: (p) => <ol className="my-4 list-decimal space-y-1 pl-6 text-foreground-light" {...p} />,
  blockquote: (p) => (
    <blockquote className="my-6 border-l-2 border-brand pl-4 text-foreground-lighter" {...p} />
  ),
  code: (p) => <code className="rounded bg-surface-200 px-1 py-0.5 font-mono text-sm" {...p} />,
  pre: (p) => (
    <pre className="my-6 overflow-x-auto rounded-md bg-surface-200 p-4 font-mono text-sm" {...p} />
  ),
  table: (p) => <table className="my-6 w-full border-collapse text-sm" {...p} />,
  th: (p) => <th className="border-b border-border px-2 py-1.5 text-left text-foreground" {...p} />,
  td: (p) => (
    <td className="border-b border-border-muted px-2 py-1.5 text-foreground-light" {...p} />
  ),
  hr: () => <hr className="my-10 border-border" />,
}
