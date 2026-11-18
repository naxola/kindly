import type { MessagingAccountStatus } from '@saas/database'

export type AccountStatusTone = 'ok' | 'pending' | 'warning' | 'error' | 'inactive'

export interface AccountStatusDescriptor {
  tone: AccountStatusTone
  /** Whether a person has to do something about it: drives what the UI puts first. */
  needsAttention: boolean
  /** Whether messages can flow right now. */
  operational: boolean
}

/**
 * What each account status means for the person looking at it. DEGRADED counts as operational but
 * needing attention: messages still flow, which is exactly why it is easy to ignore until it turns
 * into ERROR.
 */
export function describeAccountStatus(status: MessagingAccountStatus): AccountStatusDescriptor {
  switch (status) {
    case 'CONNECTED':
      return { tone: 'ok', needsAttention: false, operational: true }
    case 'PENDING':
    case 'CONNECTING':
      return { tone: 'pending', needsAttention: false, operational: false }
    case 'DEGRADED':
      return { tone: 'warning', needsAttention: true, operational: true }
    case 'ERROR':
    case 'REVOKED':
      return { tone: 'error', needsAttention: true, operational: false }
    case 'DISCONNECTED':
      return { tone: 'inactive', needsAttention: false, operational: false }
  }
}
