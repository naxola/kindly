import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/client/errors.ts'
import { sessionRedirect } from '../src/client/session-redirect.ts'

/** `reason` is the detail code when there is one (as the API sends NO_ACTIVE_ORGANIZATION). */
const api = (status: number, code: string, detail?: string) =>
  new ApiError(status, {
    error: { code, message: 'x', ...(detail ? { details: [{ code: detail }] } : {}) },
  })

describe('sessionRedirect', () => {
  it('sends an expired session to sign-in and keeps where they were', () => {
    expect(sessionRedirect(api(401, 'UNAUTHENTICATED'), '/settings/members', '?tab=1')).toBe(
      '/sign-in?next=%2Fsettings%2Fmembers%3Ftab%3D1',
    )
  })
  it('sends someone without an organization to onboarding', () => {
    expect(
      sessionRedirect(api(403, 'FORBIDDEN', 'NO_ACTIVE_ORGANIZATION'), '/settings/billing'),
    ).toBe('/onboarding')
  })
  it('does nothing on screens that work without a session or organization', () => {
    expect(sessionRedirect(api(401, 'UNAUTHENTICATED'), '/sign-in')).toBeNull()
    expect(sessionRedirect(api(401, 'UNAUTHENTICATED'), '/invite')).toBeNull()
    expect(
      sessionRedirect(api(403, 'FORBIDDEN', 'NO_ACTIVE_ORGANIZATION'), '/onboarding'),
    ).toBeNull()
  })
  it('ignores any other error', () => {
    expect(sessionRedirect(api(403, 'FORBIDDEN'), '/settings/members')).toBeNull()
    expect(sessionRedirect(new Error('x'), '/settings/members')).toBeNull()
    expect(sessionRedirect(api(404, 'NOT_FOUND'), '/')).toBeNull()
  })
})
