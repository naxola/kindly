/**
 * Operator tool: load GLOBAL knowledge (laws, official guides: it reaches every organization) from
 * a PDF, a web page or a text file. Extraction, hierarchical chunking, embeddings and storage are
 * the same use case the worker runs for an organization's uploads, but with the platform role
 * (`app_platform`, BYPASSRLS) and synchronously. What an organization uploads goes through the app.
 *
 *   pnpm knowledge:ingest --title "Estatuto de los Trabajadores" --version 2015 \
 *     --effective-from 2015-10-24 --jurisdiction ES --pdf ./et.pdf
 *   pnpm knowledge:ingest --document-id <id> --version 2024 --effective-from 2024-01-01 --url https://…
 *
 * Needs `DATABASE_PLATFORM_URL` (the platform role) and `OPENAI_API_KEY`; `--provider fake` uses a
 * deterministic embedding with no meaning, for development only: never for real knowledge.
 * Nothing is printed that could carry a key or a connection string.
 */
import { readFile } from 'node:fs/promises'
import { knowledgeExtractor } from '@saas/adapters/knowledge'
import { OpenAIEmbeddingProvider } from '@saas/adapters/knowledge'
import { loadKnowledgeEnv } from '@saas/config/env'
import {
  FakeEmbeddingProvider,
  ingestGlobalDocument,
  type EmbeddingProvider,
  type OperatorSource,
} from '@saas/core'
import { createDb } from '@saas/database'
import { parseIngestArgs, type IngestInput } from './lib/knowledge-ingest-args.ts'

async function resolveSource(input: IngestInput): Promise<OperatorSource> {
  switch (input.type) {
    case 'TEXT_FILE':
      return { kind: 'TEXT', text: await readFile(input.path, 'utf8') }
    case 'URL':
      return { kind: 'WEB', url: input.url }
    case 'PDF': {
      if (/^https?:\/\//i.test(input.location)) {
        // The same guard as a page: a PDF by URL must not reach an internal address either.
        const { assertPublicHost } = await import('@saas/adapters/knowledge')
        await assertPublicHost(new URL(input.location))
        const res = await fetch(input.location)
        if (!res.ok) throw new Error(`Downloading the PDF failed: HTTP ${res.status}`)
        return { kind: 'PDF', data: new Uint8Array(await res.arrayBuffer()) }
      }
      return { kind: 'PDF', data: new Uint8Array(await readFile(input.location)) }
    }
  }
}

function provider(kind: 'openai' | 'fake'): EmbeddingProvider {
  if (kind === 'fake') {
    console.warn(
      '[knowledge:ingest] --provider fake: vectors have no meaning. Never use it for real knowledge.',
    )
    return new FakeEmbeddingProvider()
  }
  const { OPENAI_API_KEY } = loadKnowledgeEnv()
  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is not set. Set it, or pass --provider fake for a development run.',
    )
  }
  return new OpenAIEmbeddingProvider({ apiKey: OPENAI_API_KEY })
}

async function main() {
  const args = parseIngestArgs(process.argv.slice(2))
  const url = process.env.DATABASE_PLATFORM_URL
  if (!url)
    throw new Error('DATABASE_PLATFORM_URL is not set (the connection of the platform role).')
  const db = createDb({ connectionString: url, max: 2 })
  try {
    const result = await ingestGlobalDocument(
      { db, embeddings: provider(args.provider), extractor: knowledgeExtractor },
      {
        ...(args.documentId ? { documentId: args.documentId } : {}),
        document: {
          title: args.title ?? 'unused',
          jurisdiction: args.jurisdiction,
          territory: args.territory,
          scope: args.scope,
        },
        version: {
          version: args.version,
          status: args.status,
          effectiveFrom: args.effectiveFrom,
          effectiveUntil: args.effectiveUntil,
          source: args.sourceNote,
        },
        source: await resolveSource(args.input),
      },
    )
    console.log(`Document: ${result.documentId}`)
    console.log(
      `Version: ${result.versionId} (${args.version}, ${args.status}), ${result.chunks} chunks`,
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
