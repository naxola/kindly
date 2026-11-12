import { describe, expect, it } from 'vitest'
import { DomainError, isDomainError } from '../src/index.ts'

describe('DomainError', () => {
  it('maps each code to its HTTP status', () => {
    expect(new DomainError('NOT_FOUND', 'x').httpStatus).toBe(404)
    expect(new DomainError('FORBIDDEN', 'x').httpStatus).toBe(403)
  })

  it('is recognized by the type guard and keeps details', () => {
    const error = new DomainError('VALIDATION_FAILED', 'bad input', [
      { path: 'name', code: 'TOO_SHORT' },
    ])
    expect(isDomainError(error)).toBe(true)
    expect(isDomainError(new Error('x'))).toBe(false)
    expect(error.details).toEqual([{ path: 'name', code: 'TOO_SHORT' }])
  })
})
