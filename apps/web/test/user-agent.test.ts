import { describe, expect, it } from 'vitest'
import { describeUserAgent } from '../src/client/user-agent.ts'

describe('describeUserAgent', () => {
  it('names the browser and the system', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      ),
    ).toBe('Chrome · Windows')
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      ),
    ).toBe('Safari · macOS')
    expect(
      describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'),
    ).toBe('Firefox · Linux')
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0',
      ),
    ).toBe('Edge · Windows')
  })
  it('is empty when there is nothing to say', () => {
    expect(describeUserAgent(null)).toBe('')
    expect(describeUserAgent('curl/8.0')).toBe('')
  })
})
