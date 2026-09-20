import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { messagingAccounts } from "@/modules/messaging/schema";
import { getMessagingAdapter } from "@/modules/messaging/registry";
import { isOrganizationMember } from "@/modules/organizations/service";
import type { OrganizationRole } from "@/modules/organizations/schema";
import { recordActivity } from "@/modules/audit/service";

export async function listMessagingAccounts(organizationId: string) {
  return db.select().from(messagingAccounts).where(eq(messagingAccounts.organizationId, organizationId));
}

/**
 * The accounts a given member may see (PKG-007). A DELEGATE sees only their
 * own: the channel is their personal communication identity, not the
 * organization's (`CLAUDE.md` principio 1), so exposing a colleague's
 * connection state to them is not "read-only convenience", it is someone
 * else's phone. An ADMIN sees the whole organization because managing it is
 * their job.
 */
export async function listMessagingAccountsForMember(
  organizationId: string,
  member: { userId: string; role: OrganizationRole },
) {
  return db
    .select()
    .from(messagingAccounts)
    .where(
      and(
        eq(messagingAccounts.organizationId, organizationId),
        member.role === "ADMIN" ? undefined : eq(messagingAccounts.delegateId, member.userId),
      ),
    );
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

  // Nobody connects a channel on someone else's behalf, not even an ADMIN
  // (PKG-007). This is not a policy choice: every real provider
  // authenticates the account holder themselves — a Telegram Business bot
  // is added from inside the delegate's own Telegram, and WhatsApp's
  // Embedded Signup runs against their own Meta login. An "ADMIN connects
  // for a delegate" path could only ever be theatre.
  if (input.delegateId !== input.actorUserId) {
    throw new Error("A channel can only be connected by the delegate who owns it.");
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

export interface DisconnectActor {
  organizationId: string;
  userId: string;
  role: OrganizationRole;
}

export async function disconnectMessagingAccount(actor: DisconnectActor, accountId: string) {
  const { organizationId, userId: actorUserId } = actor;
  const account = await getMessagingAccount(organizationId, accountId);
  if (!account) {
    return null;
  }

  // A DELEGATE only governs their own communication identity (PKG-007). An
  // ADMIN may disconnect any of the organization's accounts — that is
  // offboarding, and it is their job.
  if (actor.role !== "ADMIN" && account.delegateId !== actorUserId) {
    throw new Error("A DELEGATE can only disconnect their own channel.");
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
