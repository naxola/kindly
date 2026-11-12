import type { Auth } from './index.ts'
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './index.ts'

export type InvitedAccountResult =
  | { ok: true; authUserId: string }
  | { ok: false; code: 'USER_ALREADY_EXISTS' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' }

/**
 * Creates an access account whose email is ALREADY verified, for someone who arrived from
 * an invitation link: opening the link sent to that inbox proves they control it, so a
 * second verification email would add nothing. Same steps as Better Auth's own sign-up
 * (hash, user, credential account), without sending the verification email.
 * Only call it after checking that the invitation is pending and is for this email.
 */
export async function createInvitedAccount(
  auth: Auth,
  { email, name, password }: { email: string; name: string; password: string },
): Promise<InvitedAccountResult> {
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, code: 'PASSWORD_TOO_SHORT' }
  if (password.length > PASSWORD_MAX_LENGTH) return { ok: false, code: 'PASSWORD_TOO_LONG' }
  const ctx = await auth.$context
  const normalized = email.toLowerCase()
  if (await ctx.internalAdapter.findUserByEmail(normalized)) {
    return { ok: false, code: 'USER_ALREADY_EXISTS' }
  }
  const hash = await ctx.password.hash(password)
  const user = await ctx.internalAdapter.createUser(
    { email: normalized, name, emailVerified: true },
    { method: 'email-password' },
  )
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: hash,
  })
  return { ok: true, authUserId: user.id }
}
