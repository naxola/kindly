"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { connectMessagingAccount, disconnectMessagingAccount } from "@/modules/messaging/service";

export async function connectMessagingAccountAction(formData: FormData) {
  const member = await requireCurrentOrganizationMember();
  const channel = String(formData.get("channel") ?? "").trim();
  const delegateId = String(formData.get("delegateId") ?? "").trim();
  if (!channel || !delegateId) {
    throw new Error("Channel and delegate are required.");
  }

  await connectMessagingAccount({
    organizationId: member.organizationId,
    actorUserId: member.userId,
    delegateId,
    channel,
  });

  revalidatePath("/channels");
}

export async function disconnectMessagingAccountAction(accountId: string) {
  const member = await requireCurrentOrganizationMember();
  await disconnectMessagingAccount(member.organizationId, member.userId, accountId);
  revalidatePath("/channels");
}
