"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationAdmin } from "@/modules/organizations/service";
import { recordActivity } from "@/modules/audit/service";
import {
  applyDuplicateRequest,
  confirmAllWithProposal,
  confirmRequest,
  discardRequest,
  type ResolveResult,
} from "@/modules/affiliates/requests";
import { createIntegrationKey, revokeIntegrationKey } from "@/modules/affiliates/integration-keys";

/**
 * Admin decisions on the altas received by the webhook, and the integration
 * key that feeds it. ADMIN only. Failures come back as `{ error }`, never
 * thrown: a thrown message is redacted by Next in production.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function refresh() {
  revalidatePath("/affiliate-requests");
  revalidatePath("/contacts");
}

async function admin() {
  try {
    return await requireOrganizationAdmin();
  } catch {
    return null;
  }
}

const NOT_ALLOWED = { ok: false, error: "Solo un administrador puede resolver altas." } as const;
const BAD_ID = { ok: false, error: "Alta no válida." } as const;

export async function confirmAffiliateRequestAction(requestId: string, delegateId: string): Promise<ResolveResult> {
  const member = await admin();
  if (!member) return NOT_ALLOWED;
  if (!UUID.test(requestId)) return BAD_ID;
  const result = await confirmRequest(member.organizationId, member.userId, requestId, delegateId);
  refresh();
  return result;
}

export async function confirmAllAffiliateRequestsAction(): Promise<{ ok: true; confirmed: number } | { ok: false; error: string }> {
  const member = await admin();
  if (!member) return NOT_ALLOWED;
  const confirmed = await confirmAllWithProposal(member.organizationId, member.userId);
  refresh();
  return { ok: true, confirmed };
}

export async function discardAffiliateRequestAction(requestId: string): Promise<ResolveResult> {
  const member = await admin();
  if (!member) return NOT_ALLOWED;
  if (!UUID.test(requestId)) return BAD_ID;
  const result = await discardRequest(member.organizationId, member.userId, requestId);
  refresh();
  return result;
}

export async function applyDuplicateRequestAction(requestId: string): Promise<ResolveResult> {
  const member = await admin();
  if (!member) return NOT_ALLOWED;
  if (!UUID.test(requestId)) return BAD_ID;
  const result = await applyDuplicateRequest(member.organizationId, member.userId, requestId);
  refresh();
  return result;
}

export async function createIntegrationKeyAction(name: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const member = await admin();
  if (!member) return { ok: false, error: "Solo un administrador puede crear claves." };
  const { id, token } = await createIntegrationKey({ organizationId: member.organizationId, createdBy: member.userId, name });
  await recordActivity({
    organizationId: member.organizationId,
    type: "INTEGRATION_KEY_CREATED",
    actorUserId: member.userId,
    entityType: "organization",
    entityId: member.organizationId,
    metadata: { keyId: id },
  });
  revalidatePath("/organization/integrations");
  return { ok: true, token };
}

export async function revokeIntegrationKeyAction(keyId: string): Promise<ResolveResult> {
  const member = await admin();
  if (!member) return NOT_ALLOWED;
  if (!UUID.test(keyId)) return BAD_ID;
  const revoked = await revokeIntegrationKey(member.organizationId, keyId);
  if (revoked) {
    await recordActivity({
      organizationId: member.organizationId,
      type: "INTEGRATION_KEY_REVOKED",
      actorUserId: member.userId,
      entityType: "organization",
      entityId: member.organizationId,
      metadata: { keyId },
    });
  }
  revalidatePath("/organization/integrations");
  return revoked ? { ok: true } : { ok: false, error: "La clave ya estaba revocada." };
}
