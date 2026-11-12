import { describe, expect, it } from 'vitest'
import en from '../messages/en.json'
import es from '../messages/es.json'

const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  )

describe('messages', () => {
  it('es and en have exactly the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(es).sort())
  })
})
