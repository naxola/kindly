import { describe, expect, it } from 'vitest'
import { clientIp, clientKey } from '../src/client-ip.ts'

const h = (o: Record<string, string>) => new Headers(o)

describe('clientIp', () => {
  it('reads only the trusted header', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '203.0.113.7' }), 'cf-connecting-ip')).toBe(
      '203.0.113.7',
    )
  })

  it('ignores x-forwarded-for and x-real-ip, which the client can forge', () => {
    const forged = h({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '5.6.7.8' })
    expect(clientIp(forged, 'cf-connecting-ip')).toBeNull()
    expect(clientIp(forged, undefined)).toBeNull()
    expect(
      clientIp(
        h({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' }),
        'cf-connecting-ip',
      ),
    ).toBe('203.0.113.7')
  })

  it('without a trusted header the IP is unknown, even if some header is present', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '203.0.113.7' }), undefined)).toBeNull()
  })

  it('rejects values that are not an IP address', () => {
    expect(clientIp(h({ 'cf-connecting-ip': 'not-an-ip' }), 'cf-connecting-ip')).toBeNull()
    expect(clientIp(h({ 'cf-connecting-ip': '' }), 'cf-connecting-ip')).toBeNull()
  })

  it('accepts IPv6 and takes the first value of a list', () => {
    expect(clientIp(h({ 'x-ip': '2001:db8::1' }), 'x-ip')).toBe('2001:db8::1')
    expect(clientIp(h({ 'x-ip': '198.51.100.2, 10.0.0.1' }), 'x-ip')).toBe('198.51.100.2')
  })

  it('unknown IPs share one rate-limit key instead of skipping the limit', () => {
    expect(clientKey(null)).toBe('unknown-ip')
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7')
  })
})
