import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationKeys } from "@/modules/affiliates/schema";

/**
 * Bearer tokens for external systems (n8n) that push data into one
 * organization. The organization is derived from the token, never from the
 * request body. Only the SHA-256 is stored: the token is high-entropy
 * (256 random bits), so a fast hash is enough and lookup is by equality.
 */

export const AFFILIATE_INTAKE_PURPOSE = "affiliate_intake";
const TOKEN_PREFIX = "kly_";

export interface IntegrationKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a key and returns the token — the only time it is ever visible. */
export async function createIntegrationKey(input: {
  organizationId: string;
  createdBy: string;
  name: string;
  purpose?: string;
}): Promise<{ id: string; token: string }> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(integrationKeys)
    .values({
      organizationId: input.organizationId,
      purpose: input.purpose ?? AFFILIATE_INTAKE_PURPOSE,
      name: input.name.trim().slice(0, 80) || "n8n",
      keyHash: hashToken(token),
      keyPrefix: token.slice(0, TOKEN_PREFIX.length + 4),
      createdBy: input.createdBy,
    })
    .returning({ id: integrationKeys.id });
  return { id: row.id, token };
}

export async function listIntegrationKeys(organizationId: string, purpose = AFFILIATE_INTAKE_PURPOSE): Promise<IntegrationKeySummary[]> {
  return db
    .select({
      id: integrationKeys.id,
      name: integrationKeys.name,
      keyPrefix: integrationKeys.keyPrefix,
      createdAt: integrationKeys.createdAt,
      lastUsedAt: integrationKeys.lastUsedAt,
      revokedAt: integrationKeys.revokedAt,
    })
    .from(integrationKeys)
    .where(and(eq(integrationKeys.organizationId, organizationId), eq(integrationKeys.purpose, purpose)))
    .orderBy(desc(integrationKeys.createdAt));
}

/** True when a live key of this organization was revoked by this call. */
export async function revokeIntegrationKey(organizationId: string, keyId: string): Promise<boolean> {
  const rows = await db
    .update(integrationKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(integrationKeys.organizationId, organizationId), eq(integrationKeys.id, keyId), isNull(integrationKeys.revokedAt)))
    .returning({ id: integrationKeys.id });
  return rows.length > 0;
}

/** The organization a live token belongs to, or null (unknown, revoked, other purpose). */
export async function authenticateIntegrationKey(
  token: string,
  purpose = AFFILIATE_INTAKE_PURPOSE,
): Promise<{ organizationId: string; keyId: string } | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const [row] = await db
    .select({ id: integrationKeys.id, organizationId: integrationKeys.organizationId })
    .from(integrationKeys)
    .where(and(eq(integrationKeys.keyHash, hashToken(token)), eq(integrationKeys.purpose, purpose), isNull(integrationKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db.update(integrationKeys).set({ lastUsedAt: new Date() }).where(eq(integrationKeys.id, row.id));
  return { organizationId: row.organizationId, keyId: row.id };
}
