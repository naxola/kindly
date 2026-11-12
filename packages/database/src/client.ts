import { PrismaPg } from '@prisma/adapter-pg'
import { validate as isUuid } from 'uuid'
import { PrismaClient, type Prisma } from './generated/prisma/client.ts'

export type Db = PrismaClient
/** Client of a transaction with tenant context. It is the only one that sees an organization's data. */
export type TenantTx = Prisma.TransactionClient

export interface CreateDbOptions {
  connectionString: string
  /** Maximum size of the pg pool. */
  max?: number
}

export function createDb({ connectionString, max = 10 }: CreateDbOptions): Db {
  const adapter = new PrismaPg({ connectionString, max })
  return new PrismaClient({ adapter })
}

export class InvalidTenantError extends Error {
  constructor() {
    super('Invalid tenant context value')
    this.name = 'InvalidTenantError'
  }
}

export interface TenantTxOptions {
  /** Maximum transaction duration in milliseconds (default 15 s). */
  timeout?: number
  isolationLevel?: Prisma.TransactionIsolationLevel
}

type ContextSetting = 'app.org_id' | 'app.user_id' | 'app.invitation_token_hash'

async function withContext<T>(
  db: Db,
  setting: ContextSetting,
  value: string,
  fn: (tx: TenantTx) => Promise<T>,
  { timeout = 15_000, isolationLevel }: TenantTxOptions,
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config(${setting}, ${value}, true)`
      return fn(tx)
    },
    { timeout, ...(isolationLevel ? { isolationLevel } : {}) },
  )
}

/**
 * Runs `fn` in a transaction with `app.org_id` set to `organizationId` (ADR 0002).
 * RLS policies only let that organization's rows be read and written.
 * `set_config(..., true)` scopes the value to the transaction, so it is safe with pools.
 */
export async function withTenant<T>(
  db: Db,
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options: TenantTxOptions = {},
): Promise<T> {
  if (!isUuid(organizationId)) throw new InvalidTenantError()
  return withContext(db, 'app.org_id', organizationId, fn, options)
}

/**
 * Business user context without an active organization (`users.id`, ADR 0003). RLS only
 * lets them READ their own memberships and the organizations where they are active
 * (organization picker). It never allows writing any tenant's data.
 */
export async function withUser<T>(
  db: Db,
  userId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options: TenantTxOptions = {},
): Promise<T> {
  if (!isUuid(userId)) throw new InvalidTenantError()
  return withContext(db, 'app.user_id', userId, fn, options)
}

const SHA256_HEX = /^[0-9a-f]{64}$/

/** Context to resolve an invitation by its token hash: RLS only lets that row be read. */
export async function withInvitationToken<T>(
  db: Db,
  tokenHash: string,
  fn: (tx: TenantTx) => Promise<T>,
  options: TenantTxOptions = {},
): Promise<T> {
  if (!SHA256_HEX.test(tokenHash)) throw new InvalidTenantError()
  return withContext(db, 'app.invitation_token_hash', tokenHash, fn, options)
}
