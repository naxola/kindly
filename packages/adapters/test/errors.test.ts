import type { ErrorEvent } from '@sentry/node'
import { describe, expect, it } from 'vitest'
import { captureError, PRIVATE_DATA_COLLECTION, scrubEvent } from '../src/errors/index.ts'

describe('error tracking privacy', () => {
  it('collects no personal data by default', () => {
    expect(PRIVATE_DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    })
  })

  it('removes cookies, headers, bodies, query strings and user details', () => {
    const raw: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://app.test/api/v1/me',
        method: 'POST',
        cookies: { 'better-auth.session_token': 'secret' },
        headers: { authorization: 'Bearer secret' },
        data: '{"password":"secret"}',
        query_string: 'token=secret',
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
    }
    const event = scrubEvent(raw)
    expect(JSON.stringify(event)).not.toContain('secret')
    expect(event.request).toEqual({ url: 'https://app.test/api/v1/me', method: 'POST' })
    expect(event.user).toEqual({ id: 'u1' })
  })

  it('without DSN, capturing is a no-op', () => {
    expect(() => captureError(new Error('x'), { correlationId: 'c' })).not.toThrow()
  })
})
