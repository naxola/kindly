import type { Db } from '@saas/database'
import type { Auth } from './index.ts'

/**
 * Re-authentication: does `password` match the person's credential? Used before irreversible
 * actions (account deletion, ADR 0019). The hash never leaves this adapter. An account without
 * a password (none exists today) cannot be re-authenticated this way and answers `false`.
 */
export async function verifyAccountPassword(
  db: Db,
  auth: Auth,
  authUserId: string,
  password: string,
): Promise<boolean> {
  const account = await db.authAccount.findFirst({
    where: { userId: authUserId, providerId: 'credential' },
    select: { password: true },
  })
  if (!account?.password) return false
  const context = await auth.$context
  return context.password.verify({ hash: account.password, password })
}
