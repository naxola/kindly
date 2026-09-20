"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { connectMessagingAccount, disconnectMessagingAccount } from "@/modules/messaging/service";

/**
 * Connects a channel for the signed-in member — always for themselves
 * (PKG-007). The form no longer carries a delegate id: every real provider
 * authenticates the account holder in person, so picking someone else was
 * never something Kindly could honour.
 */
export async function connectMessagingAccountAction(formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const channel = String(formData.get("channel") ?? "").trim();
  if (!channel) {
    throw new Error("Channel is required.");
  }

  await connectMessagingAccount({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    delegateId: member.userId,
    channel,
  });

  revalidatePath("/channels");
}

export async function disconnectMessagingAccountAction(accountId: string) {
  const member = await requireCurrentOrganizationMember();
  await disconnectMessagingAccount(
    { organizationId: member.organizationId, userId: member.userId, role: member.role },
    accountId,
  );
  revalidatePath("/channels");
}
