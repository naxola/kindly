import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  DomainError,
  getDocument,
  listChunks,
  listDocuments,
  MAX_PDF_BYTES,
  MAX_TEXT_BYTES,
  searchKnowledge,
  submitDocument,
  submitVersion,
  type DocumentView,
  type SubmittedSource,
  type VersionView,
} from '@saas/core'
import { embeddings } from '../../knowledge.ts'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * The knowledge base: documents with versions and validity, their fragments and a hybrid search.
 * Everyone who may read sees GLOBAL knowledge and the organization's own; administrators upload
 * (always organization knowledge). An upload answers 202: the version is processed in the
 * background and its `ingestionStatus` says where it stands.
 */

const Status = z.enum(['DRAFT', 'CURRENT', 'SUPERSEDED', 'REPEALED', 'HISTORICAL'])

const VersionSchema = z
  .object({
    id: z.uuid(),
    version: z.string(),
    status: Status,
    /** First day in force, 'YYYY-MM-DD'. */
    effectiveFrom: z.string(),
    effectiveUntil: z.string().nullable(),
    source: z.string().nullable(),
    ingestionStatus: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']),
    /** Stable code when the ingestion FAILED (EMPTY_DOCUMENT, TOO_LONG...); never a provider message. */
    ingestionError: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .openapi('KnowledgeVersion')

const DocumentSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    /** GLOBAL (public) or ORGANIZATION (the organization's own). */
    visibility: z.enum(['GLOBAL', 'ORGANIZATION']),
    sourceType: z.enum(['MANUAL', 'PDF', 'WEB']),
    sourceUrl: z.string().nullable(),
    jurisdiction: z.string().nullable(),
    territory: z.string().nullable(),
    scope: z.string().nullable(),
    createdAt: z.iso.datetime(),
    versions: z.array(VersionSchema),
  })
  .openapi('KnowledgeDocument')

const ChunkSchema = z
  .object({
    id: z.uuid(),
    ordinal: z.number().int(),
    level: z.enum(['CHAPTER', 'SECTION', 'ARTICLE', 'PARAGRAPH', 'FRAGMENT']),
    label: z.string().nullable(),
    path: z.string().nullable(),
    content: z.string(),
  })
  .openapi('KnowledgeChunk')

const ResultSchema = z
  .object({
    chunkId: z.uuid(),
    documentId: z.uuid(),
    documentVersionId: z.uuid(),
    documentTitle: z.string(),
    documentSourceUrl: z.string().nullable(),
    visibility: z.enum(['GLOBAL', 'ORGANIZATION']),
    version: z.string(),
    status: Status,
    effectiveFrom: z.string(),
    effectiveUntil: z.string().nullable(),
    jurisdiction: z.string().nullable(),
    territory: z.string().nullable(),
    scope: z.string().nullable(),
    sourceNote: z.string().nullable(),
    level: z.enum(['CHAPTER', 'SECTION', 'ARTICLE', 'PARAGRAPH', 'FRAGMENT']),
    label: z.string().nullable(),
    path: z.string().nullable(),
    content: z.string(),
    score: z.number(),
  })
  .openapi('KnowledgeSearchResult')

const day = (d: Date) => d.toISOString().slice(0, 10)

const toVersion = (v: VersionView) => ({
  id: v.id,
  version: v.version,
  status: v.status,
  effectiveFrom: day(v.effectiveFrom),
  effectiveUntil: v.effectiveUntil ? day(v.effectiveUntil) : null,
  source: v.source,
  ingestionStatus: v.ingestionStatus,
  ingestionError: v.ingestionError,
  createdAt: v.createdAt.toISOString(),
})

const toDocument = (d: DocumentView) => ({
  id: d.id,
  title: d.title,
  visibility: d.visibility,
  sourceType: d.sourceType,
  sourceUrl: d.sourceUrl,
  jurisdiction: d.jurisdiction,
  territory: d.territory,
  scope: d.scope,
  createdAt: d.createdAt.toISOString(),
  versions: d.versions.map(toVersion),
})

const File_ = z.any().openapi({ type: 'string', format: 'binary' })

/** The fields of a version, as an upload form sends them (everything arrives as text). */
const VersionForm = {
  origin: z.enum(['PDF', 'TEXT', 'WEB']),
  file: File_.optional().describe('The PDF or text file (origin PDF or TEXT)'),
  url: z.string().max(2000).optional().describe('The page (origin WEB)'),
  version: z.string().max(60),
  status: z.enum(['CURRENT', 'DRAFT']).optional(),
  effectiveFrom: z.string().max(10).describe('YYYY-MM-DD'),
  effectiveUntil: z.string().max(10).optional(),
  sourceNote: z.string().max(600).optional(),
}

const list = createRoute({
  method: 'get',
  path: '/knowledge/documents',
  tags: ['knowledge'],
  summary: 'Documents the organization may read (its own and GLOBAL), newest first',
  security: cookieAuth,
  responses: {
    200: { description: 'Documents', ...json(z.object({ items: z.array(DocumentSchema) })) },
    ...errorResponses(401, 403),
  },
})

const detail = createRoute({
  method: 'get',
  path: '/knowledge/documents/{id}',
  tags: ['knowledge'],
  summary: 'A document with its versions',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Document', ...json(DocumentSchema) },
    ...errorResponses(401, 403, 404),
  },
})

const chunks = createRoute({
  method: 'get',
  path: '/knowledge/versions/{id}/chunks',
  tags: ['knowledge'],
  summary: 'The fragments of a version, in reading order',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Fragments', ...json(z.object({ items: z.array(ChunkSchema) })) },
    ...errorResponses(401, 403, 404),
  },
})

const search = createRoute({
  method: 'get',
  path: '/knowledge/search',
  tags: ['knowledge'],
  summary:
    'Hybrid search (full text + vector). Only versions applicable at the date asked (default today)',
  security: cookieAuth,
  request: {
    query: z.object({
      q: z.string().min(1).max(500),
      atDate: z.string().max(10).optional().describe('YYYY-MM-DD'),
      jurisdiction: z.string().max(120).optional(),
      territory: z.string().max(120).optional(),
      scope: z.string().max(120).optional(),
      limit: z.coerce.number().int().min(1).max(25).optional(),
    }),
  },
  responses: {
    200: { description: 'Results', ...json(z.object({ items: z.array(ResultSchema) })) },
    ...errorResponses(400, 401, 403, 503),
  },
})

const Accepted = z
  .object({ documentId: z.uuid(), versionId: z.uuid() })
  .openapi('KnowledgeAccepted')

const upload = createRoute({
  method: 'post',
  path: '/knowledge/documents',
  tags: ['knowledge'],
  summary:
    'Upload a new document of the organization (administrators). Processed in the background',
  security: cookieAuth,
  request: {
    body: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: z.object({
            title: z.string().max(300),
            jurisdiction: z.string().max(120).optional(),
            territory: z.string().max(120).optional(),
            scope: z.string().max(120).optional(),
            ...VersionForm,
          }),
        },
      },
    },
  },
  responses: {
    202: { description: 'Accepted: the version is pending', ...json(Accepted) },
    ...errorResponses(400, 401, 403),
  },
})

const newVersion = createRoute({
  method: 'post',
  path: '/knowledge/documents/{id}/versions',
  tags: ['knowledge'],
  summary: 'Upload a new version of a document of the organization (administrators)',
  security: cookieAuth,
  request: {
    params: IdParam,
    body: {
      required: true,
      content: { 'multipart/form-data': { schema: z.object(VersionForm) } },
    },
  },
  responses: {
    202: {
      description: 'Accepted: the version is pending',
      ...json(z.object({ versionId: z.uuid() })),
    },
    ...errorResponses(400, 401, 403, 404),
  },
})

type Form = Record<string, unknown>
const text = (f: Form, k: string) => (typeof f[k] === 'string' ? f[k].trim() : '')
const optional = (f: Form, k: string) => text(f, k) || null

/** The submitted source, read from the form. The size is checked before the bytes are read. */
async function sourceOf(f: Form): Promise<SubmittedSource> {
  const bad = (code: string): never => {
    throw new DomainError('VALIDATION_FAILED', 'The source is not valid', [
      { path: 'source', code },
    ])
  }
  if (f.origin === 'WEB') return { kind: 'WEB', url: text(f, 'url') }
  const file = f.file
  if (!(file instanceof File)) return bad('SOURCE_EMPTY')
  const limit = f.origin === 'PDF' ? MAX_PDF_BYTES : MAX_TEXT_BYTES
  if (file.size > limit) return bad(f.origin === 'PDF' ? 'PDF_TOO_LARGE' : 'TEXT_TOO_LARGE')
  return {
    kind: f.origin === 'PDF' ? 'PDF' : 'TEXT',
    data: new Uint8Array(await file.arrayBuffer()),
  }
}

const versionFields = (f: Form) => ({
  version: text(f, 'version'),
  status: text(f, 'status') === 'DRAFT' ? ('DRAFT' as const) : ('CURRENT' as const),
  effectiveFrom: text(f, 'effectiveFrom'),
  effectiveUntil: optional(f, 'effectiveUntil'),
  source: optional(f, 'sourceNote'),
})

export const knowledgeRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(search, async (c) => {
    const q = c.req.valid('query')
    const items = await searchKnowledge(await actorCtx(c), embeddings(), {
      query: q.q,
      ...(q.atDate ? { atDate: q.atDate } : {}),
      ...(q.jurisdiction ? { jurisdiction: q.jurisdiction } : {}),
      ...(q.territory ? { territory: q.territory } : {}),
      ...(q.scope ? { scope: q.scope } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    })
    return c.json({ items }, 200)
  })
  .openapi(list, async (c) => {
    return c.json({ items: (await listDocuments(await actorCtx(c))).map(toDocument) }, 200)
  })
  .openapi(upload, async (c) => {
    const f = c.req.valid('form') as Form
    const ctx = await actorCtx(c)
    const done = await submitDocument(
      ctx,
      {
        title: text(f, 'title'),
        jurisdiction: optional(f, 'jurisdiction'),
        territory: optional(f, 'territory'),
        scope: optional(f, 'scope'),
      },
      versionFields(f),
      await sourceOf(f),
    )
    return c.json(done, 202)
  })
  .openapi(detail, async (c) => {
    return c.json(toDocument(await getDocument(await actorCtx(c), c.req.valid('param').id)), 200)
  })
  .openapi(newVersion, async (c) => {
    const f = c.req.valid('form') as Form
    const done = await submitVersion(
      await actorCtx(c),
      c.req.valid('param').id,
      versionFields(f),
      await sourceOf(f),
    )
    return c.json(done, 202)
  })
  .openapi(chunks, async (c) => {
    return c.json({ items: await listChunks(await actorCtx(c), c.req.valid('param').id) }, 200)
  })
