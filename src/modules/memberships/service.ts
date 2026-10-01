import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/modules/memberships/schema";
import { getContact } from "@/modules/contacts/service";
import { recordActivity } from "@/modules/audit/service";

/**
 * Afiliación manual (UI-10b, `docs/ui/CONVERSATION_WORKSPACE.md` §5.1):
 * alta, edición y baja de un `Membership`. Who is *allowed* to call these
 * (ADMIN + the Contact's visible delegates) is enforced one layer up, in
 * `memberships/actions.ts` — this module only enforces multi-tenant
 * isolation (`organizationId` in every query) and the domain invariant
 * (at most one open period per Contact, via the schema's partial unique
 * index).
 */

export interface Membership {
  id: string;
  contactId: string;
  memberNumber: string | null;
  status: "ACTIVE" | "INACTIVE";
  startedAt: Date;
  endedAt: Date | null;
  feePaidUntil: string | null;
}

/**
 * The most recent period for a Contact — open (ACTIVE) or the last closed
 * one (INACTIVE), or `null` before any alta. Orders the open row first
 * regardless of `startedAt`, not just last: the alta form only collects a
 * *date* (`docs/ui/CONVERSATION_WORKSPACE.md` §5.1's `<input type=date>`),
 * so a same-day baja + "volver a afiliarse" produces two rows with an
 * identical `startedAt` — `ORDER BY started_at DESC` alone would have no
 * deterministic tiebreaker between them, and could return the closed row.
 */
export async function getCurrentMembership(organizationId: string, contactId: string): Promise<Membership | null> {
  const [row] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.contactId, contactId)))
    .orderBy(sql`(${memberships.endedAt} is null) desc`, desc(memberships.startedAt), desc(memberships.createdAt))
    .limit(1);
  return row ?? null;
}

/** Every period, most recent first — the source of "desde cuándo" / "afiliada del X al Y" for a Contact that has caused baja and returned. `createdAt` breaks the same same-day-startedAt tie as `getCurrentMembership`. */
export async function listMembershipHistory(organizationId: string, contactId: string): Promise<Membership[]> {
  return db
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.contactId, contactId)))
    .orderBy(sql`(${memberships.endedAt} is null) desc`, desc(memberships.startedAt), desc(memberships.createdAt));
}

export interface CreateMembershipInput {
  organizationId: string;
  actorUserId: string;
  contactId: string;
  memberNumber?: string | null;
  startedAt?: Date;
  feePaidUntil?: string | null;
}

/**
 * Alta manual, and also "volver a afiliarse" after a baja — the same
 * operation, since the partial unique index only forbids a *second open*
 * row: a past INACTIVE period simply stays as history underneath the new
 * one.
 */
export async function createMembership(input: CreateMembershipInput): Promise<Membership> {
  const contact = await getContact(input.organizationId, input.contactId);
  if (!contact) {
    throw new Error("Contact not found in this organization.");
  }

  const current = await getCurrentMembership(input.organizationId, input.contactId);
  if (current && current.status === "ACTIVE") {
    throw new Error("Este contacto ya tiene una afiliación activa.");
  }

  const [inserted] = await db
    .insert(memberships)
    .values({
      organizationId: input.organizationId,
      contactId: input.contactId,
      memberNumber: input.memberNumber || null,
      status: "ACTIVE",
      startedAt: input.startedAt ?? new Date(),
      feePaidUntil: input.feePaidUntil || null,
    })
    .returning();

  await recordActivity({
    organizationId: input.organizationId,
    type: "MEMBERSHIP_CREATED",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: input.contactId,
  });

  return inserted;
}

export interface UpdateMembershipInput {
  organizationId: string;
  actorUserId: string;
  contactId: string;
  memberNumber?: string | null;
  startedAt?: Date;
  feePaidUntil?: string | null;
}

/** Edits the open period in place (member number, join date, fee). `null` if the Contact has no open period — baja happened between load and submit, or it never existed. */
export async function updateMembership(input: UpdateMembershipInput): Promise<Membership | null> {
  const [updated] = await db
    .update(memberships)
    .set({
      memberNumber: input.memberNumber || null,
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      feePaidUntil: input.feePaidUntil || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(memberships.organizationId, input.organizationId),
        eq(memberships.contactId, input.contactId),
        isNull(memberships.endedAt),
      ),
    )
    .returning();

  if (!updated) {
    return null;
  }

  await recordActivity({
    organizationId: input.organizationId,
    type: "MEMBERSHIP_UPDATED",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: input.contactId,
  });

  return updated;
}

export interface EndMembershipInput {
  organizationId: string;
  actorUserId: string;
  contactId: string;
}

/** "Dar de baja": closes the open period (`status` → INACTIVE, `endedAt` → now). Throws if there is none — the UI only ever shows this button when one exists. */
export async function endMembership(input: EndMembershipInput): Promise<Membership> {
  const [updated] = await db
    .update(memberships)
    .set({ status: "INACTIVE", endedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(memberships.organizationId, input.organizationId),
        eq(memberships.contactId, input.contactId),
        isNull(memberships.endedAt),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error("Este contacto no tiene una afiliación activa.");
  }

  await recordActivity({
    organizationId: input.organizationId,
    type: "MEMBERSHIP_ENDED",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: input.contactId,
  });

  return updated;
}
