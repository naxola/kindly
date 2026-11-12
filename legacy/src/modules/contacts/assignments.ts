import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { contactAssignments } from "@/modules/contacts/schema";
import { isOrganizationMember } from "@/modules/organizations/service";
import { recordActivity } from "@/modules/audit/service";

/**
 * Who currently answers for a Contact (PKG-014, `docs/DECISIONS.md`
 * "Asignación de afiliados" y "Delegado de referencia y acceso temporal").
 * Reassignment and the derived "acceso temporal" visibility rule both live
 * here; `contacts/visibility.ts` is the SQL side that reads this table.
 *
 * The *initial* assignment a brand-new Contact gets is not here: it has to
 * run inside the same transaction that inserts the Contact row (so a
 * Contact is never observable without one), and this module has no
 * transaction-aware entry point for that. See `createContact`
 * (`contacts/service.ts`) and `findOrCreateConversation`
 * (`conversations/service.ts`), which each insert their own
 * `contact_assignments` row inline.
 */

export interface ContactAssignment {
  id: string;
  contactId: string;
  delegateId: string;
  startedAt: Date;
  endedAt: Date | null;
  assignedBy: string | null;
}

export async function getActiveAssignment(organizationId: string, contactId: string): Promise<ContactAssignment | null> {
  const [row] = await db
    .select()
    .from(contactAssignments)
    .where(
      and(
        eq(contactAssignments.organizationId, organizationId),
        eq(contactAssignments.contactId, contactId),
        isNull(contactAssignments.endedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Full history, most recent first — the "Ref.: X (antes: Y, Z)" trail on the Contact's ficha (UI-10). */
export async function listAssignmentHistory(organizationId: string, contactId: string): Promise<ContactAssignment[]> {
  return db
    .select()
    .from(contactAssignments)
    .where(and(eq(contactAssignments.organizationId, organizationId), eq(contactAssignments.contactId, contactId)))
    .orderBy(desc(contactAssignments.startedAt));
}

/**
 * Reassigns a Contact to a different reference delegate — the ADMIN-only
 * action from `docs/DECISIONS.md`. Closes the current active row
 * (`endedAt = now()`) and inserts a new one in the same transaction, so
 * there is never an instant with zero or two active assignments. A no-op
 * (returns the unchanged current assignment) when `delegateId` already is
 * the active one — reassigning someone to themselves must not reset
 * `startedAt` or write a spurious Activity.
 */
export async function assignContactToDelegate(
  organizationId: string,
  actorUserId: string,
  contactId: string,
  delegateId: string,
): Promise<ContactAssignment> {
  if (!(await isOrganizationMember(organizationId, delegateId))) {
    throw new Error("Cannot assign a contact to a user outside the organization.");
  }

  const current = await getActiveAssignment(organizationId, contactId);
  if (current && current.delegateId === delegateId) {
    return current;
  }

  const inserted = await db.transaction(async (tx) => {
    await tx
      .update(contactAssignments)
      .set({ endedAt: new Date() })
      .where(
        and(
          eq(contactAssignments.organizationId, organizationId),
          eq(contactAssignments.contactId, contactId),
          isNull(contactAssignments.endedAt),
        ),
      );

    const [row] = await tx
      .insert(contactAssignments)
      .values({ organizationId, contactId, delegateId, assignedBy: actorUserId })
      .returning();
    return row;
  });

  await recordActivity({
    organizationId,
    type: "CONTACT_DELEGATE_ASSIGNED",
    actorUserId,
    entityType: "contact",
    entityId: contactId,
    metadata: { from: current?.delegateId ?? null, to: delegateId },
  });

  return inserted;
}
