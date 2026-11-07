import { describe, expect, it } from 'vitest'
import { missingKeys } from './check-env.ts'

describe('check-env', () => {
  it('lists required variables missing from .env, ignoring commented examples', () => {
    const example =
      'APP_URL=http://x\nSITE_URL=http://y\n# PLAUSIBLE_DOMAIN=example.com\nEMAIL_FROM="A <a@b>"\n'
    const actual = 'APP_URL=http://other\n  EMAIL_FROM=x\n'
    expect(missingKeys(example, actual)).toEqual(['SITE_URL'])
  })
})
