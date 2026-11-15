import { describe, expect, it } from 'vitest'
import { scrubBrowserEvent } from '../src/client/browser-errors.ts'

describe('scrubBrowserEvent', () => {
  it('drops the query string and the fragment of the page URL (invitation tokens live there)', () => {
    const event = scrubBrowserEvent({
      request: {
        url: 'https://app.example.com/invite?x=1#secret-token',
        headers: { Cookie: 'a=b' },
      },
    })
    expect(event.request?.url).toBe('https://app.example.com/invite')
    expect(JSON.stringify(event)).not.toContain('secret-token')
    expect(event.request?.headers).toBeUndefined()
  })

  it('removes cookies, bodies, user data, breadcrumbs and extra data', () => {
    const event = scrubBrowserEvent({
      request: { cookies: { s: '1' }, data: { password: 'x' }, query_string: 'a=1' },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
      breadcrumbs: [{ message: 'typed in the email field' }],
      extra: { form: { email: 'a@b.c' } },
    })
    expect(event.request?.cookies).toBeUndefined()
    expect(event.request?.data).toBeUndefined()
    expect(event.request?.query_string).toBeUndefined()
    expect(event.user).toEqual({})
    expect(event.breadcrumbs).toBeUndefined()
    expect(event.extra).toBeUndefined()
  })

  it('removes the fragment from stack frames too', () => {
    const event = scrubBrowserEvent({
      exception: {
        values: [
          { stacktrace: { frames: [{ filename: 'https://app.example.com/a.js?t=1#frag' }] } },
        ],
      },
    })
    expect(event.exception?.values?.[0]?.stacktrace?.frames?.[0]?.filename).toBe(
      'https://app.example.com/a.js',
    )
  })

  it('leaves an event without those parts untouched', () => {
    expect(scrubBrowserEvent({ message: 'hi' })).toEqual({ message: 'hi' })
  })
})
