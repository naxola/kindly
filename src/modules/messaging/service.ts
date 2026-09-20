import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { messagingAccounts } from "@/modules/messaging/schema";
import { getMessagingAdapter } from "@/modules/messaging/registry";
import { isOrganizationMember } from "@/modules/organizations/service";
import { recordActivity } from "@/modules/audit/service";

export async function listMessagingAccounts(organizationId: string) {
  return db.select().from(messagingAccounts).where(eq(messagingAccounts.organizationId, organizationId));
}

export async function getMessagingAccount(organizationId: string, accountId: string) {
  const [row] = await db
    .select()
    .from(messagingAccounts)
    .where(and(eq(messagingAccounts.organizationId, organizationId), eq(messagingAccounts.id, accountId)))
    .limit(1);
  return row ?? null;
}

/** Looked up by the webhook route: no organizationId available yet at that point (the URL only carries channel + accountId). */
export async function getMessagingAccountByChannelAndId(channel: string, accountId: string) {
  const [row] = await db
    .select()
    .from(messagingAccounts)
    .where(and(eq(messagingAccounts.channel, channel), eq(messagingAccounts.id, accountId)))
    .limit(1);
  return row ?? null;
}

export interface ConnectMessagingAccountInput {
  organizationId: string;
  actorUserId: string;
  delegateId: string;
  channel: string;
  authorizationPayload?: Record<string, unknown>;
}

export async function connectMessagingAccount(input: ConnectMessagingAccountInput) {
  const adapter = getMessagingAdapter(input.channel);
  if (!adapter) {
    throw new Error(`No MessagingAdapter registered for channel "${input.channel}".`);
  }

  // Defense in depth (CLAUDE.md sección 5, same pattern as
  // cases/service.ts): without this, a delegateId belonging to a user
  // outside the organization was accepted without any check — found while
  // building the /channels UI (PKG-004), the first real caller of this
  // function outside tests.
  if (!(await isOrganizationMember(input.organizationId, input.delegateId))) {
    throw new Error("Cannot connect a channel for a delegate outside the organization.");
  }

  const result = await adapter.connectAccount({
    organizationId: input.organizationId,
    delegateId: input.delegateId,
    authorizationPayload: input.authorizationPayload,
  });

  const [account] = await db
    .insert(messagingAccounts)
    .values({
      organizationId: input.organizationId,
      delegateId: input.delegateId,
      channel: input.channel,
      phoneE164: result.phoneE164 || null,
      externalAccountId: result.externalAccountId,
      externalBusinessAccountId: result.externalBusinessAccountId || null,
      externalConnectionId: result.externalConnectionId || null,
      displayName: result.displayName || null,
      status: "CONNECTED",
      metadata: result.metadata || null,
      credentialsReference: result.credentialsReference || null,
      connectedAt: new Date(),
    })
    .returning();

  await recordActivity({
    organizationId: input.organizationId,
    type: "CHANNEL_CONNECTED",
    actorUserId: input.actorUserId,
    entityType: "messaging_account",
    entityId: account.id,
    metadata: { channel: input.channel },
  });

  return account;
}

export async function disconnectMessagingAccount(
  organizationId: string,
  actorUserId: string,
  accountId: string,
) {
  const account = await getMessagingAccount(organizationId, accountId);
  if (!account) {
    return null;
  }

  const adapter = getMessagingAdapter(account.channel);
  if (!adapter) {
    throw new Error(`No MessagingAdapter registered for channel "${account.channel}".`);
  }

  // Some channels cannot be disconnected from our side at all — WhatsApp
  // coexistence has no Deregister API, the delegate ends it from their own
  // phone and we only learn about it through a webhook
  // (docs/INTEGRATIONS.md sección 2.2). Refusing here rather than silently
  // marking the row DISCONNECTED keeps Kindly's state honest: the
  // connection would still be live at the provider.
  if (!adapter.capabilities.canDisconnect) {
    throw new Error(
      `Channel "${account.channel}" cannot be disconnected from Kindly — the delegate must do it from their own device.`,
    );
  }

  await adapter.disconnectAccount(account);

  const [updated] = await db
    .update(messagingAccounts)
    .set({ status: "DISCONNECTED", disconnectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(messagingAccounts.organizationId, organizationId), eq(messagingAccounts.id, accountId)))
    .returning();

  await recordActivity({
    organizationId,
    type: "CHANNEL_DISCONNECTED",
    actorUserId,
    entityType: "messaging_account",
    entityId: accountId,
    metadata: { channel: account.channel },
  });

  return updated ?? null;
}

/**
 * Records a disconnection that happened outside Kindly — the delegate
 * disconnected from their own device, or the provider revoked the
 * connection (WhatsApp `account_update` / `PARTNER_REMOVED`). Reached only
 * from the webhook pipeline, so there is no acting user.
 *
 * Idempotent: a webhook redelivered after the account is already
 * DISCONNECTED changes nothing and logs nothing twice.
 */
export async function applyProviderDisconnection(accountId: string, reason?: string | null) {
  const [account] = await db
    .select()
    .from(messagingAccounts)
    .where(eq(messagingAccounts.id, accountId))
    .limit(1);
  if (!account || account.status === "DISCONNECTED") {
    return null;
  }

  const [updated] = await db
    .update(messagingAccounts)
    .set({
      status: "DISCONNECTED",
      disconnectedAt: new Date(),
      lastError: reason || null,
      updatedAt: new Date(),
    })
    .where(eq(messagingAccounts.id, accountId))
    .returning();

  await recordActivity({
    organizationId: account.organizationId,
    type: "CHANNEL_DISCONNECTED",
    actorUserId: null,
    entityType: "messaging_account",
    entityId: accountId,
    metadata: { channel: account.channel, initiatedBy: "provider", reason: reason || null },
  });

  return updated ?? null;
}
