import {
  FakeEmbeddingProvider,
  type EmbeddingProvider,
  type KnowledgeExtractor,
  type SiteDiscovery,
} from '@saas/core'
import { loadKnowledgeEnv } from '@saas/config/env'
import { extractPdfText } from './extract-pdf.ts'
import {
  extractPageMeta,
  fetchGuarded,
  fetchWebText,
  type FetchWebTextOptions,
} from './extract-web.ts'
import { discoverPages } from './site-discovery.ts'
import { OpenAIEmbeddingProvider } from './openai-embedding.ts'

export { OpenAIEmbeddingProvider } from './openai-embedding.ts'
export { extractPdfText } from './extract-pdf.ts'
export {
  fetchWebText,
  htmlToText,
  fetchGuarded,
  extractPageMeta,
  extractTitle,
} from './extract-web.ts'
export {
  discoverPages,
  parseRobotsTxt,
  isAllowedByRobots,
  parseSitemapXml,
  parseFeed,
  findFeedLinks,
} from './site-discovery.ts'
export { assertPublicHost, isPrivateAddress } from './network-guard.ts'

/**
 * The embedding provider the environment asks for: OpenAI when `OPENAI_API_KEY` is set, otherwise
 * none (ingestion then fails with a clear code instead of embedding garbage). Nothing is built
 * unless the key is present.
 */
export function embeddingProviderFromEnv(
  source: Record<string, string | undefined> = process.env,
): EmbeddingProvider | null {
  const env = loadKnowledgeEnv(source)
  if (env.E2E_FAKE_EMBEDDINGS) return new FakeEmbeddingProvider()
  return env.OPENAI_API_KEY ? new OpenAIEmbeddingProvider({ apiKey: env.OPENAI_API_KEY }) : null
}

/** Reads text out of a PDF (local parsing) and a public web page (SSRF-guarded). */
export const knowledgeExtractor: KnowledgeExtractor = {
  extractPdf: extractPdfText,
  fetchWebText: (url) => fetchWebText(url),
  discoverSite: (url) => discoverSite(url),
}

/**
 * Name and preview of a site (from its home page) and the pages its sitemap or feed offers. The
 * home page must be readable: an unreachable or private site fails here, before anything is stored.
 */
export async function discoverSite(
  url: string,
  options: FetchWebTextOptions = {},
): Promise<SiteDiscovery> {
  const home = await fetchGuarded(url, { ...options, maxBytes: 2 * 1024 * 1024 })
  const meta = extractPageMeta(home.body, home.finalUrl)
  const found = await discoverPages(url, options)
  const source = { sitemap: 'SITEMAP', feed: 'FEED', none: 'NONE' } as const
  return {
    name: meta.title,
    imageUrl: meta.imageUrl,
    source: source[found.source],
    pages: found.pages,
    truncated: found.truncated,
  }
}
