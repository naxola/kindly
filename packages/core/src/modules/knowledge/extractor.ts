/**
 * Reads text out of the sources an administrator can submit. Implemented outside core
 * (`packages/adapters/knowledge`): PDF parsing and fetching a web page are I/O. A failure is just an
 * `Error`: the ingestion turns it into a stable code and never shows the provider's message.
 */
export interface KnowledgeExtractor {
  extractPdf(data: Uint8Array): Promise<string>
  /** Downloads a public page (never an internal address) and returns its readable text. */
  fetchWebText(url: string): Promise<string>
  /**
   * Optional: what a website offers to index, from its sitemap (announced in robots.txt) or its
   * RSS/Atom feed, plus its name and preview image. No crawling. Throws when the site cannot be
   * read (or is not public).
   */
  discoverSite?(url: string): Promise<SiteDiscovery>
}

export interface DiscoveredSitePage {
  url: string
  /** Known only from a feed. */
  title: string | null
  lastModified: string | null
}

export interface SiteDiscovery {
  name: string | null
  imageUrl: string | null
  source: 'SITEMAP' | 'FEED' | 'NONE'
  pages: DiscoveredSitePage[]
  /** More pages existed than the discovery keeps. */
  truncated: boolean
}
