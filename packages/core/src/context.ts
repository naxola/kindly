import type { Db } from '@saas/database'
import type { JobQueue } from './jobs.ts'
import type { Actor } from './modules/identity/authorization.ts'

/** Dependencies and request information shared by every use case. */
export interface BaseCtx {
  db: Db
  queue: JobQueue
  correlationId: string
  /** Public URL of the app, to build links in emails. */
  appUrl: string
  ip?: string | null
  now?: () => Date
}

/** Context of a tenant use case: an authenticated business actor in its active organization. */
export interface Ctx extends BaseCtx {
  actor: Actor
}

export const nowOf = (ctx: Pick<BaseCtx, 'now'>) => (ctx.now ? ctx.now() : new Date())
