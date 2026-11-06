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

/**
 * Runs `fn` in a transaction with `app.org_id` set to `organizationId` (ADR 0002).
 * RLS policies only let that organization's rows be read and written.
 * `set_config(..., true)` scopes the value to the transaction, so it is safe with pools.
 */
export async function withTenant<T>(
  db: Db,
  organizationId: string,
  fn: (tx: TenantTx) => Promise<T>,
  { timeout = 15_000, isolationLevel }: TenantTxOptions = {},
): Promise<T> {
  if (!isUuid(organizationId)) throw new InvalidTenantError()
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`
      return fn(tx)
    },
    { timeout, ...(isolationLevel ? { isolationLevel } : {}) },
  )
}
