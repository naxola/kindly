import { FakeEmbeddingProvider, type EmbeddingProvider, type KnowledgeExtractor } from '@saas/core'
import { loadKnowledgeEnv } from '@saas/config/env'
import { extractPdfText } from './extract-pdf.ts'
import { fetchWebText } from './extract-web.ts'
import { OpenAIEmbeddingProvider } from './openai-embedding.ts'

export { OpenAIEmbeddingProvider } from './openai-embedding.ts'
export { extractPdfText } from './extract-pdf.ts'
export { fetchWebText, htmlToText } from './extract-web.ts'
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
}
