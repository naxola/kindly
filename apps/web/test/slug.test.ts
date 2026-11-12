import { CreateOrganizationInput } from '@saas/core'
import { describe, expect, it } from 'vitest'
import { slugify } from '../src/client/slug.ts'

describe('slugify', () => {
  it('produces slugs the API accepts', () => {
    for (const name of ['Acme', 'Compañía Ñandú S.L.', '  Muy   Largo '.repeat(10), 'Él & Ella']) {
      const slug = slugify(name)
      expect(CreateOrganizationInput.safeParse({ name: 'xx', slug }).success).toBe(true)
    }
    expect(slugify('Compañía Ñandú S.L.')).toBe('compania-nandu-s-l')
  })
})
