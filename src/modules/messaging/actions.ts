"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";
import { connectMessagingAccount, disconnectMessagingAccount } from "@/modules/messaging/service";
import {
  PREFLIGHT_CHECKS,
  checkCountrySupport,
  getUnsupportedCountryCodes,
} from "@/modules/messaging/whatsapp-onboarding";

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

/**
 * Final step of the WhatsApp coexistence onboarding (PKG-008).
 *
 * Re-validates every acknowledgement server-side. The form already keeps
 * the button disabled until they are all ticked, but that is a courtesy to
 * the reader, not a guarantee about what reaches the server — and these
 * particular acknowledgements are about someone's phone losing features,
 * so "the UI wouldn't let you" is not good enough.
 */
export async function startCoexistenceConnectionAction(channel: string, formData: FormData) {
  const member = await requireCurrentOrganizationMember();

  const acknowledged = new Set(formData.getAll("acknowledged").map(String));
  const missing = PREFLIGHT_CHECKS.filter((check) => !acknowledged.has(check.id));
  if (missing.length > 0) {
    redirect(
      `/channels/connect/${channel}/coexistence?error=${encodeURIComponent(
        "Faltan puntos por confirmar antes de conectar.",
      )}`,
    );
  }

  const unsupportedCodes = getUnsupportedCountryCodes();
  const countryCode = String(formData.get("countryCode") ?? "").trim();
  if (unsupportedCodes.length > 0) {
    const support = checkCountrySupport(countryCode, unsupportedCodes);
    if (support === "UNSUPPORTED") {
      redirect(
        `/channels/connect/${channel}/coexistence?error=${encodeURIComponent(
          "Coexistence no está disponible para números de ese país. Tendrías que usar un número de otra región.",
        )}`,
      );
    }
  }

  try {
    await connectMessagingAccount({
      organizationId: member.organizationId,
      actorUserId: member.userId,
      delegateId: member.userId,
      channel,
      authorizationPayload: { onboarding: "WHATSAPP_COEXISTENCE", countryCode: countryCode || null },
    });
  } catch (error) {
    // The provider refused. Show what it said instead of a generic failure:
    // at this point the delegate has already done work on their phone and
    // deserves to know which part of it was rejected.
    const message = error instanceof Error ? error.message : "Error desconocido al conectar.";
    redirect(`/channels/connect/${channel}/coexistence?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/channels");
  redirect("/channels");
}
