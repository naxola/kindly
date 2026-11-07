import { DomainError } from '@saas/core'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { handleError } from '../src/server/api/errors.ts'
import type { ApiEnv } from '../src/server/api/types.ts'

const captureError = vi.hoisted(() => vi.fn())
vi.mock('@saas/adapters/errors', () => ({ captureError }))

const silent = { error: () => undefined }
const app = new Hono<ApiEnv>()
app.use('*', async (c, next) => {
  c.set('correlationId', 'corr-1')
  c.set('log', silent as unknown as ApiEnv['Variables']['log'])
  await next()
})
app.get('/boom', () => {
  throw new Error('secret internals')
})
app.get('/forbidden', () => {
  throw new DomainError('FORBIDDEN', 'No')
})
app.onError(handleError)

describe('API error handling', () => {
  it('reports unhandled errors with the correlationId and hides them from the client', async () => {
    const res = await app.request('/boom')
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).not.toContain('secret internals')
    expect(body).toContain('corr-1')
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      correlationId: 'corr-1',
      tags: { method: 'GET', route: '/boom' },
    })
  })

  it('expected domain errors are not reported', async () => {
    captureError.mockClear()
    const res = await app.request('/forbidden')
    expect(res.status).toBe(403)
    expect(captureError).not.toHaveBeenCalled()
  })
})
