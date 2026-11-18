import { describe, expect, it } from 'vitest'
import { authorize, can, DomainError, permissionsOf, type Actor } from '../src/index.ts'

const actor = (role: 'ADMIN' | 'MEMBER'): Actor => ({
  userId: 'u',
  memberId: 'm',
  organizationId: 'o',
  role,
  permissions: permissionsOf(role),
})

describe('authorization', () => {
  it('ADMIN can manage members; MEMBER can only read', () => {
    expect(can(actor('ADMIN'), 'members.manage')).toBe(true)
    expect(can(actor('MEMBER'), 'members.read')).toBe(true)
    expect(can(actor('MEMBER'), 'members.invite')).toBe(false)
  })

  it('authorize throws FORBIDDEN with the missing permission', () => {
    let error: unknown
    try {
      authorize(actor('MEMBER'), 'members.manage')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).code).toBe('FORBIDDEN')
    expect((error as DomainError).details).toEqual([
      { code: 'MISSING_PERMISSION', path: 'members.manage' },
    ])
  })
})
