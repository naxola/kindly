import { handleAffiliateIntake } from "@/modules/affiliates/intake-endpoint";

/**
 * Inbound altas from an external automation (n8n). Authenticated with the
 * organization's integration key (`Authorization: Bearer kly_…`), created by
 * an ADMIN in Organización → Integraciones. Altas are stored pending: an
 * ADMIN confirms the delegate before anyone else sees the affiliate.
 */
export async function POST(request: Request) {
  const outcome = await handleAffiliateIntake(request.headers.get("authorization"), await request.text());
  return Response.json(outcome.body, { status: outcome.status });
}
