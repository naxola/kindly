import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  addWebsite,
  addWebsitePage,
  deleteWebsite,
  getWebsite,
  indexWebsitePages,
  listWebsites,
  MAX_PAGES_PER_INDEXING,
  rediscoverWebsite,
  updateWebsiteSettings,
  type WebsiteView,
} from '@saas/core'
import { knowledgeSources } from '../../knowledge.ts'
import { cookieAuth, errorResponses, IdParam } from '../openapi.ts'
import { actorCtx } from '../session.ts'
import type { ApiEnv } from '../types.ts'
import { json } from './schemas.ts'

/**
 * Websites as knowledge sources (administrators): add a site, see the pages its sitemap or feed
 * offers, pick which to index (each becomes a document ingested by the usual job), look for new
 * pages, set the publication data, remove the site (its documents stay).
 */

const PageStatus = z.enum(['DISCOVERED', 'INDEXING', 'INDEXED', 'FAILED'])

const SettingsSchema = z
  .object({
    version: z.string(),
    publishAsCurrent: z.boolean(),
    effectiveFrom: z.string().nullable(),
    effectiveUntil: z.string().nullable(),
    sourceNote: z.string().nullable(),
    jurisdiction: z.string().nullable(),
    territory: z.string().nullable(),
    scope: z.string().nullable(),
  })
  .openapi('WebsiteSettings')

const WebsiteSchema = z
  .object({
    id: z.uuid(),
    url: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
    discoverySource: z.enum(['SITEMAP', 'FEED', 'NONE']),
    truncated: z.boolean(),
    discoveredAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
    counts: z.object({
      total: z.number().int(),
      DISCOVERED: z.number().int(),
      INDEXING: z.number().int(),
      INDEXED: z.number().int(),
      FAILED: z.number().int(),
    }),
    settings: SettingsSchema,
  })
  .openapi('KnowledgeWebsite')

const PageSchema = z
  .object({
    id: z.uuid(),
    url: z.string(),
    title: z.string().nullable(),
    status: PageStatus,
    documentId: z.uuid().nullable(),
    error: z.string().nullable(),
  })
  .openapi('KnowledgeWebsitePage')

const toWebsite = (w: WebsiteView) => ({
  ...w,
  discoveredAt: w.discoveredAt.toISOString(),
  createdAt: w.createdAt.toISOString(),
})

const list = createRoute({
  method: 'get',
  path: '/knowledge/websites',
  tags: ['knowledge'],
  summary: 'Websites the organization indexes pages from (administrators)',
  security: cookieAuth,
  responses: {
    200: { description: 'Websites', ...json(z.object({ items: z.array(WebsiteSchema) })) },
    ...errorResponses(401, 403),
  },
})

const add = createRoute({
  method: 'post',
  path: '/knowledge/websites',
  tags: ['knowledge'],
  summary: 'Add a website and list the pages its sitemap or feed offers (nothing indexed yet)',
  security: cookieAuth,
  request: { body: { required: true, ...json(z.object({ url: z.string().min(1).max(2000) })) } },
  responses: {
    201: { description: 'Added', ...json(WebsiteSchema) },
    ...errorResponses(400, 401, 403, 409, 503),
  },
})

const detail = createRoute({
  method: 'get',
  path: '/knowledge/websites/{id}',
  tags: ['knowledge'],
  summary: 'A website with its pages and the state of each',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: {
      description: 'Website',
      ...json(z.object({ website: WebsiteSchema, pages: z.array(PageSchema) })),
    },
    ...errorResponses(401, 403, 404),
  },
})

const index = createRoute({
  method: 'post',
  path: '/knowledge/websites/{id}/index',
  tags: ['knowledge'],
  summary: `Index the chosen pages (at most ${MAX_PAGES_PER_INDEXING}); failed ones are retried`,
  security: cookieAuth,
  request: {
    params: IdParam,
    body: {
      required: true,
      ...json(z.object({ pageIds: z.array(z.uuid()).min(1).max(MAX_PAGES_PER_INDEXING) })),
    },
  },
  responses: {
    200: { description: 'Started', ...json(z.object({ started: z.number().int() })) },
    ...errorResponses(400, 401, 403, 404),
  },
})

const addPage = createRoute({
  method: 'post',
  path: '/knowledge/websites/{id}/pages',
  tags: ['knowledge'],
  summary: 'Add a page of the same site by its address',
  security: cookieAuth,
  request: {
    params: IdParam,
    body: { required: true, ...json(z.object({ url: z.string().min(1).max(2000) })) },
  },
  responses: {
    201: { description: 'Added', ...json(PageSchema) },
    ...errorResponses(400, 401, 403, 404, 409),
  },
})

const rediscover = createRoute({
  method: 'post',
  path: '/knowledge/websites/{id}/rediscover',
  tags: ['knowledge'],
  summary: 'Look for pages again; only the new ones are added',
  security: cookieAuth,
  request: { params: IdParam },
  responses: {
    200: { description: 'Looked', ...json(z.object({ added: z.number().int() })) },
    ...errorResponses(400, 401, 403, 404, 503),
  },
})

const settings = createRoute({
  method: 'put',
  path: '/knowledge/websites/{id}',
  tags: ['knowledge'],
  summary: 'Name and publication data of what is indexed from now on',
  security: cookieAuth,
  request: {
    params: IdParam,
    body: {
      required: true,
      ...json(
        z.object({
          name: z.string().min(1).max(200),
          version: z.string().min(1).max(60),
          publishAsCurrent: z.boolean(),
          effectiveFrom: z.string().nullish(),
          effectiveUntil: z.string().nullish(),
          sourceNote: z.string().max(600).nullish(),
          jurisdiction: z.string().max(120).nullish(),
          territory: z.string().max(120).nullish(),
          scope: z.string().max(120).nullish(),
        }),
      ),
    },
  },
  responses: {
    200: { description: 'Updated', ...json(WebsiteSchema) },
    ...errorResponses(400, 401, 403, 404),
  },
})

const remove = createRoute({
  method: 'delete',
  path: '/knowledge/websites/{id}',
  tags: ['knowledge'],
  summary: 'Remove the website and its page list (its documents stay)',
  security: cookieAuth,
  request: { params: IdParam },
  responses: { 204: { description: 'Removed' }, ...errorResponses(401, 403, 404) },
})

export const knowledgeWebsiteRoutes = new OpenAPIHono<ApiEnv>()
  .openapi(list, async (c) => {
    const items = await listWebsites(await actorCtx(c))
    return c.json({ items: items.map(toWebsite) }, 200)
  })
  .openapi(add, async (c) => {
    const site = await addWebsite(await actorCtx(c), knowledgeSources(), c.req.valid('json'))
    return c.json(toWebsite(site), 201)
  })
  .openapi(detail, async (c) => {
    const { website, pages } = await getWebsite(await actorCtx(c), c.req.valid('param').id)
    return c.json({ website: toWebsite(website), pages }, 200)
  })
  .openapi(index, async (c) => {
    const ctx = await actorCtx(c)
    return c.json(await indexWebsitePages(ctx, c.req.valid('param').id, c.req.valid('json')), 200)
  })
  .openapi(addPage, async (c) => {
    const ctx = await actorCtx(c)
    return c.json(await addWebsitePage(ctx, c.req.valid('param').id, c.req.valid('json')), 201)
  })
  .openapi(rediscover, async (c) => {
    const ctx = await actorCtx(c)
    return c.json(await rediscoverWebsite(ctx, knowledgeSources(), c.req.valid('param').id), 200)
  })
  .openapi(settings, async (c) => {
    const ctx = await actorCtx(c)
    const site = await updateWebsiteSettings(ctx, c.req.valid('param').id, c.req.valid('json'))
    return c.json(toWebsite(site), 200)
  })
  .openapi(remove, async (c) => {
    await deleteWebsite(await actorCtx(c), c.req.valid('param').id)
    return c.body(null, 204)
  })
