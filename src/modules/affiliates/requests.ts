import "server-only";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { isPostgresUniqueViolation } from "@/db/errors";
import { users } from "@/modules/auth/schema";
import { organizationMembers } from "@/modules/organizations/schema";
import { isOrganizationDelegate } from "@/modules/organizations/service";
import { contactAssignments, contacts } from "@/modules/contacts/schema";
import { assignContactToDelegate } from "@/modules/contacts/assignments";
import { memberships } from "@/modules/memberships/schema";
import { conversations } from "@/modules/conversations/schema";
import { cases } from "@/modules/cases/schema";
import { recordActivity } from "@/modules/audit/service";
import { affiliateProfiles, affiliateRequests, type AffiliateRequestStatus } from "@/modules/affiliates/schema";
import { normalizeAffiliatePayload, type NormalizedAffiliate } from "@/modules/affiliates/normalize";
import { proposeDelegate, type DelegateLoad } from "@/modules/affiliates/proposal";

/**
 * Altas received from the n8n webhook and the admin's decision on each
 * (`docs/DECISIONS.md`, "Altas de afiliados por webhook"). Everything is
 * scoped by `organizationId`; who may call the admin functions (ADMIN only)
 * is enforced one layer up, in `actions.ts`.
 *
 * Reception creates the Contact, its affiliate profile and an ACTIVE
 * membership right away, but **no assignment**: until the admin confirms,
 * only an ADMIN can see that Contact (`contactVisibilityCondition`).
 */

export type IntakeItemResult =
  | { status: "RECEIVED"; requestId: string; repeated: boolean }
  | { status: "DUPLICATE"; requestId: string; repeated: boolean }
  | { status: "INVALID"; errors: string[] };

const OPEN_STATUSES: AffiliateRequestStatus[] = ["PENDING", "DUPLICATE"];

/** Delegates (never admins) with their load, in the fixed tie-break order: who joined first. */
export async function getDelegateLoads(organizationId: string): Promise<DelegateLoad[]> {
  const delegates = await db
    .select({ userId: organizationMembers.userId, name: users.name })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.role, "DELEGATE")))
    .orderBy(asc(organizationMembers.createdAt), asc(organizationMembers.userId));

  const assigned = await db
    .select({ delegateId: contactAssignments.delegateId, total: count() })
    .from(contactAssignments)
    .where(and(eq(contactAssignments.organizationId, organizationId), isNull(contactAssignments.endedAt)))
    .groupBy(contactAssignments.delegateId);
  const pending = await db
    .select({ delegateId: affiliateRequests.proposedDelegateId, total: count() })
    .from(affiliateRequests)
    .where(and(eq(affiliateRequests.organizationId, organizationId), eq(affiliateRequests.status, "PENDING")))
    .groupBy(affiliateRequests.proposedDelegateId);

  const assignedBy = new Map(assigned.map((row) => [row.delegateId, row.total]));
  const pendingBy = new Map(pending.map((row) => [row.delegateId, row.total]));
  return delegates.map((d) => ({ ...d, assigned: assignedBy.get(d.userId) ?? 0, pending: pendingBy.get(d.userId) ?? 0 }));
}

function profileValues(data: NormalizedAffiliate) {
  return {
    dni: data.dni,
    birthDate: data.birthDate,
    gender: data.gender,
    streetType: data.address.streetType,
    street: data.address.street,
    streetNumber: data.address.number,
    staircase: data.address.staircase,
    floor: data.address.floor,
    door: data.address.door,
    addressOther: data.address.other,
    country: data.address.country,
    postalCode: data.address.postalCode,
    city: data.address.city,
    addressProvince: data.address.province,
    province: data.province,
    sector: data.sector,
    employmentStatus: data.employmentStatus,
    monthlyFeeCents: data.monthlyFeeCents,
    workplace: data.workplace,
    workplaceProvince: data.workplaceProvince,
  };
}

async function findOpenRequest(organizationId: string, dni: string) {
  const [row] = await db
    .select()
    .from(affiliateRequests)
    .where(and(eq(affiliateRequests.organizationId, organizationId), eq(affiliateRequests.dni, dni), inArray(affiliateRequests.status, OPEN_STATUSES)))
    .limit(1);
  return row ?? null;
}

/** Stores one alta of the webhook payload. Never throws for bad input: it comes back as `INVALID`. */
export async function receiveAffiliateAlta(organizationId: string, rawItem: unknown): Promise<IntakeItemResult> {
  const normalized = normalizeAffiliatePayload(rawItem);
  if (!normalized.ok) return { status: "INVALID", errors: normalized.errors };
  const data = normalized.value;

  const repeatedOf = async (): Promise<IntakeItemResult | null> => {
    const open = await findOpenRequest(organizationId, data.dni);
    return open ? { status: open.status === "DUPLICATE" ? "DUPLICATE" : "RECEIVED", requestId: open.id, repeated: true } : null;
  };

  const already = await repeatedOf();
  if (already) return already;

  const [existing] = await db
    .select({ contactId: affiliateProfiles.contactId })
    .from(affiliateProfiles)
    .where(and(eq(affiliateProfiles.organizationId, organizationId), eq(affiliateProfiles.dni, data.dni)))
    .limit(1);

  try {
    if (existing) {
      const [request] = await db
        .insert(affiliateRequests)
        .values({ organizationId, status: "DUPLICATE", dni: data.dni, duplicateOfContactId: existing.contactId, data })
        .returning({ id: affiliateRequests.id });
      await recordActivity({
        organizationId,
        type: "AFFILIATE_REQUEST_RECEIVED",
        actorUserId: null,
        entityType: "affiliate_request",
        entityId: request.id,
        metadata: { duplicateOfContactId: existing.contactId },
      });
      return { status: "DUPLICATE", requestId: request.id, repeated: false };
    }

    const proposedDelegateId = proposeDelegate(await getDelegateLoads(organizationId));
    const { contactId, requestId } = await db.transaction(async (tx) => {
      const [contact] = await tx
        .insert(contacts)
        .values({ organizationId, name: `${data.firstName} ${data.lastName}`, phoneE164: data.phoneE164, email: data.email })
        .returning({ id: contacts.id });
      await tx.insert(affiliateProfiles).values({ organizationId, contactId: contact.id, ...profileValues(data) });
      await tx.insert(memberships).values({ organizationId, contactId: contact.id, status: "ACTIVE" });
      const [request] = await tx
        .insert(affiliateRequests)
        .values({ organizationId, status: "PENDING", dni: data.dni, contactId: contact.id, proposedDelegateId, data })
        .returning({ id: affiliateRequests.id });
      return { contactId: contact.id, requestId: request.id };
    });
    await recordActivity({
      organizationId,
      type: "CONTACT_CREATED",
      actorUserId: null,
      entityType: "contact",
      entityId: contactId,
      metadata: { source: "affiliate_intake" },
    });
    await recordActivity({
      organizationId,
      type: "AFFILIATE_REQUEST_RECEIVED",
      actorUserId: null,
      entityType: "affiliate_request",
      entityId: requestId,
      metadata: { contactId, proposedDelegateId },
    });
    return { status: "RECEIVED", requestId, repeated: false };
  } catch (error) {
    // Two deliveries of the same DNI racing: the loser answers with the winner's request.
    if (isPostgresUniqueViolation(error)) {
      const winner = await repeatedOf();
      if (winner) return winner;
    }
    throw error;
  }
}

export interface AffiliateRequestRow {
  id: string;
  status: AffiliateRequestStatus;
  receivedAt: Date;
  contactId: string | null;
  duplicateOfContactId: string | null;
  duplicateOfName: string | null;
  proposedDelegateId: string | null;
  data: NormalizedAffiliate;
}

export async function listOpenRequests(organizationId: string): Promise<AffiliateRequestRow[]> {
  const rows = await db
    .select({
      id: affiliateRequests.id,
      status: affiliateRequests.status,
      receivedAt: affiliateRequests.receivedAt,
      contactId: affiliateRequests.contactId,
      duplicateOfContactId: affiliateRequests.duplicateOfContactId,
      duplicateOfName: contacts.name,
      proposedDelegateId: affiliateRequests.proposedDelegateId,
      data: affiliateRequests.data,
    })
    .from(affiliateRequests)
    .leftJoin(contacts, eq(contacts.id, affiliateRequests.duplicateOfContactId))
    .where(and(eq(affiliateRequests.organizationId, organizationId), inArray(affiliateRequests.status, OPEN_STATUSES)))
    .orderBy(asc(affiliateRequests.receivedAt));
  return rows;
}

/** Altas waiting for the admin (pending assignment + possible duplicates): the badge and the toast. */
export async function countOpenRequests(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(affiliateRequests)
    .where(and(eq(affiliateRequests.organizationId, organizationId), inArray(affiliateRequests.status, OPEN_STATUSES)));
  return row?.total ?? 0;
}

export type ResolveResult = { ok: true } | { ok: false; error: string };

/** Claims a request still in `from` so a double click or two admins resolve it once. */
async function claim(
  organizationId: string,
  actorUserId: string,
  requestId: string,
  from: AffiliateRequestStatus,
  to: AffiliateRequestStatus,
  finalDelegateId: string | null,
) {
  const [row] = await db
    .update(affiliateRequests)
    .set({ status: to, finalDelegateId, resolvedBy: actorUserId, resolvedAt: new Date() })
    .where(and(eq(affiliateRequests.organizationId, organizationId), eq(affiliateRequests.id, requestId), eq(affiliateRequests.status, from)))
    .returning();
  return row ?? null;
}

const ALREADY_RESOLVED = "Esta alta ya fue resuelta.";

/** Confirms a PENDING alta: the Contact is assigned to `delegateId` (a DELEGATE of this organization). */
export async function confirmRequest(
  organizationId: string,
  actorUserId: string,
  requestId: string,
  delegateId: string,
): Promise<ResolveResult> {
  if (!(await isOrganizationDelegate(organizationId, delegateId))) {
    return { ok: false, error: "Elige un delegado de la organización." };
  }
  const request = await claim(organizationId, actorUserId, requestId, "PENDING", "CONFIRMED", delegateId);
  if (!request || !request.contactId) return { ok: false, error: ALREADY_RESOLVED };
  await assignContactToDelegate(organizationId, actorUserId, request.contactId, delegateId);
  await recordActivity({
    organizationId,
    type: "AFFILIATE_REQUEST_CONFIRMED",
    actorUserId,
    entityType: "affiliate_request",
    entityId: request.id,
    metadata: { contactId: request.contactId, delegateId, proposedDelegateId: request.proposedDelegateId },
  });
  return { ok: true };
}

/** Confirms every PENDING alta with its own proposal. Returns how many were confirmed. */
export async function confirmAllWithProposal(organizationId: string, actorUserId: string): Promise<number> {
  const pending = await db
    .select({ id: affiliateRequests.id, proposedDelegateId: affiliateRequests.proposedDelegateId })
    .from(affiliateRequests)
    .where(and(eq(affiliateRequests.organizationId, organizationId), eq(affiliateRequests.status, "PENDING")))
    .orderBy(asc(affiliateRequests.receivedAt));
  let confirmed = 0;
  for (const request of pending) {
    if (!request.proposedDelegateId) continue;
    const result = await confirmRequest(organizationId, actorUserId, request.id, request.proposedDelegateId);
    if (result.ok) confirmed++;
  }
  return confirmed;
}

/**
 * Discards an alta. A PENDING one also removes the Contact it created — but
 * only while nothing else hangs from it (conversations, cases); otherwise
 * the Contact stays and only the request is closed.
 */
export async function discardRequest(organizationId: string, actorUserId: string, requestId: string): Promise<ResolveResult> {
  const [open] = await db
    .select({ status: affiliateRequests.status })
    .from(affiliateRequests)
    .where(and(eq(affiliateRequests.organizationId, organizationId), eq(affiliateRequests.id, requestId)))
    .limit(1);
  if (!open || (open.status !== "PENDING" && open.status !== "DUPLICATE")) return { ok: false, error: ALREADY_RESOLVED };

  const request = await claim(organizationId, actorUserId, requestId, open.status, "DISCARDED", null);
  if (!request) return { ok: false, error: ALREADY_RESOLVED };

  let contactRemoved = false;
  if (open.status === "PENDING" && request.contactId) {
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.organizationId, organizationId), eq(conversations.contactId, request.contactId)))
      .limit(1);
    const [linkedCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.organizationId, organizationId), eq(cases.contactId, request.contactId)))
      .limit(1);
    if (!conversation && !linkedCase) {
      await db.delete(contacts).where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, request.contactId)));
      contactRemoved = true;
    }
  }
  await recordActivity({
    organizationId,
    type: "AFFILIATE_REQUEST_DISCARDED",
    actorUserId,
    entityType: "affiliate_request",
    entityId: request.id,
    metadata: { wasDuplicate: open.status === "DUPLICATE", contactRemoved },
  });
  return { ok: true };
}

/** For a DUPLICATE: overwrites the existing affiliate's data with what the new alta carries. */
export async function applyDuplicateRequest(organizationId: string, actorUserId: string, requestId: string): Promise<ResolveResult> {
  const request = await claim(organizationId, actorUserId, requestId, "DUPLICATE", "CONFIRMED", null);
  if (!request || !request.duplicateOfContactId) return { ok: false, error: ALREADY_RESOLVED };
  const data = request.data;
  await db.transaction(async (tx) => {
    await tx
      .update(contacts)
      .set({
        name: `${data.firstName} ${data.lastName}`,
        ...(data.phoneE164 ? { phoneE164: data.phoneE164 } : {}),
        ...(data.email ? { email: data.email } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, request.duplicateOfContactId!)));
    await tx
      .update(affiliateProfiles)
      .set({ ...profileValues(data), updatedAt: new Date() })
      .where(and(eq(affiliateProfiles.organizationId, organizationId), eq(affiliateProfiles.contactId, request.duplicateOfContactId!)));
  });
  await recordActivity({
    organizationId,
    type: "AFFILIATE_REQUEST_APPLIED",
    actorUserId,
    entityType: "affiliate_request",
    entityId: request.id,
    metadata: { contactId: request.duplicateOfContactId },
  });
  return { ok: true };
}

