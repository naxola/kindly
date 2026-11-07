import { describe, expect, it, vi } from 'vitest'
import { startHeartbeat } from '../src/health.ts'

const url = 'https://kuma.test/api/push/token123?status=up'

describe('heartbeat', () => {
  it('calls the monitor while ready', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}'))
    const onError = vi.fn()
    const hb = startHeartbeat({
      url,
      intervalMs: 60_000,
      ready: () => Promise.resolve(true),
      onError,
      fetchImpl,
    })
    await hb.beat()
    hb.stop()
    expect(fetchImpl).toHaveBeenCalledWith(url, expect.anything())
    expect(onError).not.toHaveBeenCalled()
  })

  it('stays silent when not ready, so the monitor raises the alarm', async () => {
    const fetchImpl = vi.fn()
    const onError = vi.fn()
    const hb = startHeartbeat({
      url,
      intervalMs: 60_000,
      ready: () => Promise.reject(new Error('db down')),
      onError,
      fetchImpl,
    })
    await hb.beat()
    hb.stop()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalled()
  })

  it('never reports the URL (it carries the token)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError(`fetch failed ${url}`))
    const reasons: string[] = []
    const hb = startHeartbeat({
      url,
      intervalMs: 60_000,
      ready: () => Promise.resolve(true),
      onError: (r) => reasons.push(r),
      fetchImpl,
    })
    await hb.beat()
    hb.stop()
    expect(reasons.join(' ')).not.toContain('token123')
  })
})
