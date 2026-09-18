import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { messagingAccounts } from "@/modules/messaging/schema";
import { getMessagingAdapter } from "@/modules/messaging/registry";
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
