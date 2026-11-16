import { createHash, randomBytes } from 'node:crypto'
import { withIntegrationKey, withTenant, type Db } from '@saas/database'
import { z } from 'zod'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize } from '../identity/index.ts'

/**
 * Bearer keys an external system (n8n) uses to push altas into ONE organization: the organization
 * is deduced from the key, never from the request body. Only the SHA-256 of the token is stored;
 * the token has 256 random bits, so a fast hash is enough and the lookup is by equality
 * (docs/DECISIONS.md, "Altas de afiliados por webhook": a key, not an HMAC signature).
 */

export const AFFILIATE_INTAKE_PURPOSE = 'affiliate_intake'
const TOKEN_PREFIX = 'kly_'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export interface IntegrationKeyView {
  id: string
  name: string
  keyPrefix: string
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

const view = (k: IntegrationKeyView): IntegrationKeyView => ({
  id: k.id,
  name: k.name,
  keyPrefix: k.keyPrefix,
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
  revokedAt: k.revokedAt,
})

export const CreateIntegrationKeyInput = z.object({
  name: z.string().trim().min(1).max(80),
})
export type CreateIntegrationKeyInput = z.input<typeof CreateIntegrationKeyInput>

/** Creates a key and returns its token: the only time it is ever visible. */
export async function createIntegrationKey(
  ctx: Ctx,
  input: CreateIntegrationKeyInput,
): Promise<{ key: IntegrationKeyView; token: string }> {
  authorize(ctx.actor, 'integrations.manage')
  const { name } = CreateIntegrationKeyInput.parse(input)
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const created = await tx.integrationKey.create({
      data: {
        organizationId: ctx.actor.organizationId,
        purpose: AFFILIATE_INTAKE_PURPOSE,
        name,
        keyHash: hashToken(token),
        keyPrefix: token.slice(0, TOKEN_PREFIX.length + 4),
        createdById: ctx.actor.memberId,
      },
    })
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'integration_key.created',
      resourceType: 'integration_key',
      resourceId: created.id,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return { key: view(created), token }
  })
}

export async function listIntegrationKeys(ctx: Ctx): Promise<IntegrationKeyView[]> {
  authorize(ctx.actor, 'integrations.manage')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) =>
    (
      await tx.integrationKey.findMany({
        where: { purpose: AFFILIATE_INTAKE_PURPOSE },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    ).map(view),
  )
}

/** Revokes a live key: from then on it answers 401. */
export async function revokeIntegrationKey(ctx: Ctx, keyId: string): Promise<IntegrationKeyView> {
  authorize(ctx.actor, 'integrations.manage')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const { count } = await tx.integrationKey.updateMany({
      where: { id: keyId, revokedAt: null },
      data: { revokedAt: ctx.now?.() ?? new Date() },
    })
    if (count === 0) throw new DomainError('NOT_FOUND', 'Integration key not found')
    await writeAudit(tx, {
      organizationId: ctx.actor.organizationId,
      actorUserId: ctx.actor.userId,
      action: 'integration_key.revoked',
      resourceType: 'integration_key',
      resourceId: keyId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    })
    return view(await tx.integrationKey.findUniqueOrThrow({ where: { id: keyId } }))
  })
}

/**
 * The organization a live token belongs to, or null (unknown, revoked, other purpose, malformed).
 * Records the last use. Never logs the token.
 */
export async function authenticateIntegrationKey(
  db: Db,
  token: string,
): Promise<{ organizationId: string; keyId: string } | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null
  const keyHash = hashToken(token)
  const key = await withIntegrationKey(db, keyHash, (tx) =>
    tx.integrationKey.findFirst({
      where: { keyHash, purpose: AFFILIATE_INTAKE_PURPOSE, revokedAt: null },
      select: { id: true, organizationId: true },
    }),
  )
  if (!key) return null
  await withTenant(db, key.organizationId, (tx) =>
    tx.integrationKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }),
  )
  return { organizationId: key.organizationId, keyId: key.id }
}
