import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createPasswordBreachCheck } from '../src/auth/password-breach.ts'

const sha1 = (v: string) => createHash('sha1').update(v).digest('hex').toUpperCase()

/** Answers like the range API: `SUFFIX:count` lines for a prefix, plus padding lines (count 0). */
const rangeServer = (breached: string[]) =>
  vi.fn<typeof fetch>((input) => {
    const prefix = (input as string).split('/range/')[1]!
    const lines = breached
      .filter((p) => sha1(p).startsWith(prefix))
      .map((p) => `${sha1(p).slice(5)}:42`)
    lines.push('0123456789ABCDEF0123456789ABCDEF012:0') // padding
    return Promise.resolve(new Response(lines.join('\r\n'), { status: 200 }))
  })

describe('createPasswordBreachCheck (ADR 0016)', () => {
  it('rejects a password found in a breach and accepts one that is not', async () => {
    const fetchImpl = rangeServer(['password1234567'])
    const check = createPasswordBreachCheck({ enabled: true, fetchImpl })
    expect(await check('password1234567')).toBe(true)
    expect(await check('una frase bastante larga y rara 8271')).toBe(false)
  })

  it('sends only the first 5 characters of the SHA-1, never the password or the full hash', async () => {
    const fetchImpl = rangeServer([])
    const check = createPasswordBreachCheck({ enabled: true, fetchImpl })
    await check('secret passphrase 123')
    const url = fetchImpl.mock.calls[0]![0] as string
    expect(url).toBe(
      `https://api.pwnedpasswords.com/range/${sha1('secret passphrase 123').slice(0, 5)}`,
    )
    expect(url).not.toContain('secret')
    expect(url).not.toContain(sha1('secret passphrase 123').slice(5))
    const init = fetchImpl.mock.calls[0]![1]
    expect((init?.headers as Record<string, string>)['Add-Padding']).toBe('true')
  })

  it('ignores padding lines, which have a count of zero', async () => {
    const padded = vi.fn(() =>
      Promise.resolve(
        new Response(`${sha1('whatever 123456789').slice(5)}:0\r\n`, { status: 200 }),
      ),
    )
    expect(
      await createPasswordBreachCheck({ enabled: true, fetchImpl: padded })('whatever 123456789'),
    ).toBe(false)
  })

  it('accepts the password and reports it when the service fails (fail open)', async () => {
    const onUnavailable = vi.fn()
    for (const fetchImpl of [
      vi.fn(() => Promise.reject(new Error('network down'))),
      vi.fn(() => Promise.resolve(new Response('', { status: 503 }))),
    ]) {
      const check = createPasswordBreachCheck({ enabled: true, fetchImpl, onUnavailable })
      expect(await check('anything at all 12345')).toBe(false)
    }
    expect(onUnavailable).toHaveBeenCalledTimes(2)
    // The report never carries the password.
    expect(JSON.stringify(onUnavailable.mock.calls)).not.toContain('anything at all')
  })

  it('gives up after the timeout instead of holding the request', async () => {
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const onUnavailable = vi.fn()
    const check = createPasswordBreachCheck({
      enabled: true,
      fetchImpl: hang,
      timeoutMs: 20,
      onUnavailable,
    })
    expect(await check('a password that hangs 1')).toBe(false)
    expect(onUnavailable).toHaveBeenCalledOnce()
  })

  it('does nothing when it is turned off', async () => {
    const fetchImpl = vi.fn()
    expect(await createPasswordBreachCheck({ enabled: false, fetchImpl })('password1234567')).toBe(
      false,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
