import "server-only";
import { authenticateIntegrationKey } from "@/modules/affiliates/integration-keys";
import { receiveAffiliateAlta, type IntakeItemResult } from "@/modules/affiliates/requests";

export const MAX_INTAKE_BODY_BYTES = 512 * 1024;
export const MAX_INTAKE_ITEMS = 50;

export type IntakeResponse = { status: number; body: unknown };

/**
 * `POST /api/integrations/affiliate-requests`, minus the framework: auth by
 * Bearer token, then each item of the array is stored (or reported) on its
 * own, so one bad alta never blocks the others. The body is accepted as the
 * n8n array as-is, or as a single object. No personal data is logged.
 */
export async function handleAffiliateIntake(authorization: string | null, rawBody: string): Promise<IntakeResponse> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const auth = token ? await authenticateIntegrationKey(token) : null;
  if (!auth) return { status: 401, body: { error: "Unauthorized" } };

  if (Buffer.byteLength(rawBody) > MAX_INTAKE_BODY_BYTES) return { status: 413, body: { error: "Payload too large" } };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Body must be JSON" } };
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length === 0) return { status: 400, body: { error: "Empty payload" } };
  if (items.length > MAX_INTAKE_ITEMS) return { status: 400, body: { error: `At most ${MAX_INTAKE_ITEMS} items per request` } };

  const results: ({ index: number } & IntakeItemResult)[] = [];
  for (const [index, item] of items.entries()) {
    results.push({ index, ...(await receiveAffiliateAlta(auth.organizationId, item)) });
  }
  return { status: 202, body: { results } };
}
