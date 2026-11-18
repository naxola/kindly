import type { Logger } from '@saas/adapters/logger'

/** Access identity of the request (Better Auth session). Never business data (ADR 0003). */
export interface SessionAccess {
  authUserId: string
  email: string
  name: string
  emailVerified: boolean
}

export interface ApiEnv {
  Variables: {
    correlationId: string
    log: Logger
    /** Present when the request carries a valid session (`session` middleware). */
    access?: SessionAccess
  }
}
