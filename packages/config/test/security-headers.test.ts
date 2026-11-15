import { describe, expect, it } from 'vitest'
import {
  buildCsp,
  createNonce,
  paddleSources,
  staticSecurityHeaders,
  urlOrigin,
} from '../src/security-headers.ts'

const names = (https: boolean) => staticSecurityHeaders({ https }).map((h) => h.key)

describe('staticSecurityHeaders', () => {
  it('sends HSTS only over https', () => {
    expect(names(true)).toContain('Strict-Transport-Security')
    expect(names(false)).not.toContain('Strict-Transport-Security')
  })
  it('always blocks sniffing and framing', () => {
    expect(names(false)).toEqual(
      expect.arrayContaining(['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']),
    )
  })
})

describe('buildCsp', () => {
  it('uses the nonce with strict-dynamic and no unsafe-inline for scripts', () => {
    const script = buildCsp({ nonce: 'abc' }).match(/script-src ([^;]*)/)?.[1]
    expect(script).toContain(`'nonce-abc'`)
    expect(script).toContain(`'strict-dynamic'`)
    expect(script).not.toContain('unsafe-inline')
  })
  it('allows inline scripts on static pages (no nonce)', () => {
    expect(buildCsp().match(/script-src ([^;]*)/)?.[1]).toContain(`'unsafe-inline'`)
  })
  it('allows eval only in development', () => {
    expect(buildCsp({ nonce: 'a' })).not.toContain('unsafe-eval')
    expect(buildCsp({ nonce: 'a', development: true })).toContain('unsafe-eval')
  })
  it('forbids framing, plugins and foreign forms by default', () => {
    const csp = buildCsp({ nonce: 'a' })
    expect(csp).toContain(`frame-ancestors 'none'`)
    expect(csp).toContain(`object-src 'none'`)
    expect(csp).toContain(`form-action 'self'`)
    expect(csp).toContain(`frame-src 'none'`)
  })
  it('opens Paddle hosts only when asked, sandbox apart from production', () => {
    expect(buildCsp({ nonce: 'a' })).not.toContain('paddle')
    const p = paddleSources('sandbox')
    const csp = buildCsp({ nonce: 'a', frameSrc: p.frame, connectSrc: p.connect })
    expect(csp).toContain('https://sandbox-buy.paddle.com')
    expect(csp).not.toContain(' https://buy.paddle.com')
  })
})

describe('createNonce', () => {
  it('differs per call', () => {
    expect(createNonce()).not.toBe(createNonce())
  })
})

describe('urlOrigin', () => {
  it('gives the origin of a DSN, without its key or path', () => {
    expect(urlOrigin('https://abc123@errors.example.com/4')).toBe('https://errors.example.com')
    expect(urlOrigin('http://key@localhost:3199/1')).toBe('http://localhost:3199')
  })
  it('is null for nothing or for garbage', () => {
    expect(urlOrigin(undefined)).toBeNull()
    expect(urlOrigin('')).toBeNull()
    expect(urlOrigin('not a url')).toBeNull()
  })
})
