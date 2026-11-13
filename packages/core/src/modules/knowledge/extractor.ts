/**
 * Reads text out of the sources an administrator can submit. Implemented outside core
 * (`packages/adapters/knowledge`): PDF parsing and fetching a web page are I/O. A failure is just an
 * `Error`: the ingestion turns it into a stable code and never shows the provider's message.
 */
export interface KnowledgeExtractor {
  extractPdf(data: Uint8Array): Promise<string>
  /** Downloads a public page (never an internal address) and returns its readable text. */
  fetchWebText(url: string): Promise<string>
}
