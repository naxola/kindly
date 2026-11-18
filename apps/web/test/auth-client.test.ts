import { describe, expect, it } from 'vitest'
import { safeNext } from '../src/client/auth.ts'

describe('safeNext', () => {
  it('keeps internal paths', () => {
    expect(safeNext('/settings/members?tab=1')).toBe('/settings/members?tab=1')
  })

  it('rejects open redirects and falls back', () => {
    for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test', 'evil', '', null]) {
      expect(safeNext(bad)).toBe('/')
    }
  })
})
