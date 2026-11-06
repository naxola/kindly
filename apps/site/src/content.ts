import { fileContentSource } from '@saas/content'
import { join } from 'node:path'

/**
 * Content of the site (ADR 0005). Read at build time: every page is prerendered, so the
 * running server never reads these files. Drafts only show up in development.
 */
export const content = fileContentSource({
  root: join(process.cwd(), 'content'),
  includeDrafts: process.env.NODE_ENV === 'development',
})
