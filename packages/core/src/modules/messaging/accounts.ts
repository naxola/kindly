import { Prisma, withTenant, type MessagingAccount, type TenantTx } from '@saas/database'
import type { Ctx } from '../../context.ts'
import { DomainError } from '../../errors.ts'
import { recordActivity } from '../activity/index.ts'
import { writeAudit } from '../audit/index.ts'
import { authorize, can } from '../identity/index.ts'
import type { MessagingRegistry } from './port.ts'

/**
 * A channel is the delegate's personal communication identity, not the organization's (product
 * principle 1): everyone sees and connects their OWN accounts; administrators see all of them and
 * may disconnect any (offboarding). Nobody connects a channel on someone else's behalf, not even an
 * administrator: every provider authenticates the account holder themselves.
 *
 * The account never exposes `credentialsReference` or `metadata` to callers of these use cases.
 */

export type MessagingAccountView = Omit<MessagingAccount, 'credentialsReference' | 'metadata'> & {
  delegateName: string
}

export async function listMessagingAccounts(ctx: Ctx): Promise<MessagingAccountView[]> {
  authorize(ctx.actor, 'channels.read')
  return withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    const rows = await tx.messagingAccount.findMany({
      where: can(ctx.actor, 'channels.read_all') ? {} : { delegateId: ctx.actor.memberId },
      include: {
        delegate: {
          select: {
            user: { select: { displayName: true } },
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })
    return rows.map(({ delegate, ...account }) =>
      toView(
        account,
        delegate.profile
          ? [delegate.profile.firstName, delegate.profile.lastName].filter(Boolean).join(' ')
          : delegate.user.displayName,
      ),
    )
  })
}

/** The account without the pointer to its secret and the provider's metadata. */
function toView(account: MessagingAccount, delegateName: string): MessagingAccountView {
  const safe: Partial<MessagingAccount> = { ...account }
  delete safe.credentialsReference
  delete safe.metadata
  return { ...(safe as Omit<MessagingAccount, 'credentialsReference' | 'metadata'>), delegateName }
}

/** What a delegate can connect here: the channels this process has an adapter for. */
export interface ConnectableChannel {
  channel: string
  /** DIRECT connects in one step; the others need the guided onboarding (acknowledgements first). */
  onboarding: 'DIRECT' | 'WHATSAPP_COEXISTENCE'
  /** False when the connection can only be ended from the delegate's own device. */
  canDisconnect: boolean
  /** Whether the provider needs the webhook URL registered by hand (subscription handshake). */
  hasWebhookHandshake: boolean
}

export function listConnectableChannels(
  ctx: Ctx,
  registry: MessagingRegistry,
): ConnectableChannel[] {
  authorize(ctx.actor, 'channels.read')
  return registry.channels().flatMap((channel) => {
    const adapter = registry.get(channel)
    return adapter
      ? [
          {
            channel,
            onboarding: adapter.capabilities.onboarding,
            canDisconnect: adapter.capabilities.canDisconnect,
            hasWebhookHandshake: !!adapter.verifyWebhookChallenge,
          },
        ]
      : []
  })
}

/**
 * Connects an account for the actor themselves through the channel's adapter, in one step. Channels
 * that need the guided onboarding (what the delegate must acknowledge about their phone first) are
 * refused here: they go through `connectWithOnboarding`, so the checklist cannot be skipped by
 * calling this directly.
 */
export async function connectMessagingAccount(
  ctx: Ctx,
  registry: MessagingRegistry,
  input: { channel: string; authorizationPayload?: Record<string, unknown> },
): Promise<MessagingAccountView> {
  const adapter = registry.get(input.channel)
  if (adapter && adapter.capabilities.onboarding !== 'DIRECT') {
    authorize(ctx.actor, 'channels.connect')
    throw new DomainError('CONFLICT', 'This channel needs the guided onboarding', [
      { code: 'ONBOARDING_REQUIRED' },
    ])
  }
  return connectAccount(ctx, registry, input)
}

export async function connectAccount(
  ctx: Ctx,
  registry: MessagingRegistry,
  input: { channel: string; authorizationPayload?: Record<string, unknown> },
): Promise<MessagingAccountView> {
  authorize(ctx.actor, 'channels.connect')
  const adapter = registry.get(input.channel)
  if (!adapter) {
    throw new DomainError('VALIDATION_FAILED', 'Unknown channel', [
      { path: 'channel', code: 'UNKNOWN_CHANNEL' },
    ])
  }
  const result = await adapter.connectAccount({
    organizationId: ctx.actor.organizationId,
    delegateId: ctx.actor.memberId,
    ...(input.authorizationPayload ? { authorizationPayload: input.authorizationPayload } : {}),
  })
  try {
    return await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
      const account = await tx.messagingAccount.create({
        data: {
          organizationId: ctx.actor.organizationId,
          delegateId: ctx.actor.memberId,
          channel: input.channel,
          phone: result.phone ?? null,
          externalAccountId: result.externalAccountId,
          externalBusinessAccountId: result.externalBusinessAccountId ?? null,
          externalConnectionId: result.externalConnectionId ?? null,
          displayName: result.displayName ?? null,
          status: 'CONNECTED',
          metadata: (result.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          credentialsReference: result.credentialsReference ?? null,
          connectedAt: ctx.now?.() ?? new Date(),
        },
      })
      await recordActivity(tx, {
        organizationId: ctx.actor.organizationId,
        type: 'CHANNEL_CONNECTED',
        actorMemberId: ctx.actor.memberId,
        entityType: 'messaging_account',
        entityId: account.id,
        metadata: { channel: input.channel },
      })
      await audit(ctx, tx, 'messaging_account.connected', account.id, { channel: input.channel })
      return toView(account, '')
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DomainError('CONFLICT', 'That account is already connected', [
        { code: 'ACCOUNT_ALREADY_CONNECTED' },
      ])
    }
    throw error
  }
}

/**
 * Disconnects an account from Kindly's side. A delegate disconnects their own; an administrator
 * any. Channels that cannot be disconnected from here (coexistence: no Deregister API) are refused
 * instead of being silently marked DISCONNECTED: the connection would still be live at the
 * provider and Kindly's state would be a lie.
 */
export async function disconnectMessagingAccount(
  ctx: Ctx,
  registry: MessagingRegistry,
  accountId: string,
): Promise<void> {
  authorize(ctx.actor, 'channels.read')
  const account = await withTenant(ctx.db, ctx.actor.organizationId, (tx) =>
    tx.messagingAccount.findUnique({ where: { id: accountId } }),
  )
  const own = account?.delegateId === ctx.actor.memberId
  if (!account || (!own && !can(ctx.actor, 'channels.read_all'))) {
    throw new DomainError('NOT_FOUND', 'Account not found')
  }
  if (!own) authorize(ctx.actor, 'channels.disconnect_any')
  const adapter = registry.get(account.channel)
  if (!adapter) {
    throw new DomainError('VALIDATION_FAILED', 'Unknown channel', [
      { path: 'channel', code: 'UNKNOWN_CHANNEL' },
    ])
  }
  if (!adapter.capabilities.canDisconnect) {
    throw new DomainError('CONFLICT', 'This channel can only be disconnected from the device', [
      { code: 'CANNOT_DISCONNECT_FROM_KINDLY' },
    ])
  }
  await adapter.disconnectAccount(account)
  await withTenant(ctx.db, ctx.actor.organizationId, async (tx) => {
    await tx.messagingAccount.update({
      where: { id: accountId },
      data: { status: 'DISCONNECTED', disconnectedAt: ctx.now?.() ?? new Date() },
    })
    await recordActivity(tx, {
      organizationId: ctx.actor.organizationId,
      type: 'CHANNEL_DISCONNECTED',
      actorMemberId: ctx.actor.memberId,
      entityType: 'messaging_account',
      entityId: accountId,
      metadata: { channel: account.channel },
    })
    await audit(ctx, tx, 'messaging_account.disconnected', accountId, { channel: account.channel })
  })
}

/**
 * Records a disconnection that happened outside Kindly (webhook pipeline, no acting user).
 * Idempotent: a redelivered webhook after the account is DISCONNECTED changes and logs nothing.
 */
export async function applyProviderDisconnection(
  tx: TenantTx,
  account: MessagingAccount,
  reason: string | null | undefined,
  at: Date,
): Promise<void> {
  if (account.status === 'DISCONNECTED') return
  await tx.messagingAccount.update({
    where: { id: account.id },
    data: { status: 'DISCONNECTED', disconnectedAt: at, lastError: reason ?? null },
  })
  await recordActivity(tx, {
    organizationId: account.organizationId,
    type: 'CHANNEL_DISCONNECTED',
    actorMemberId: null,
    entityType: 'messaging_account',
    entityId: account.id,
    metadata: { channel: account.channel, initiatedBy: 'provider', reason: reason ?? null },
  })
}

// Ids and the channel only: phones and names are personal data.
const audit = (
  ctx: Ctx,
  tx: TenantTx,
  action: string,
  accountId: string,
  after: Prisma.InputJsonValue,
) =>
  writeAudit(tx, {
    organizationId: ctx.actor.organizationId,
    actorUserId: ctx.actor.userId,
    action,
    resourceType: 'messaging_account',
    resourceId: accountId,
    after,
    correlationId: ctx.correlationId,
    ip: ctx.ip,
  })
