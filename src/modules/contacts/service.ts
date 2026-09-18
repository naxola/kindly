import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts } from "@/modules/contacts/schema";
import { recordActivity } from "@/modules/audit/service";

/**
 * Every function here takes `organizationId` explicitly and filters by it
 * in the WHERE clause of every query — never trust a caller-supplied id
 * without the equivalent filter (CLAUDE.md sección 5, aislamiento
 * multi-tenant). A wrong organizationId simply matches zero rows instead of
 * leaking another organization's Contact.
 */

export async function listContacts(organizationId: string) {
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId))
    .orderBy(desc(contacts.createdAt));
}

export async function getContact(organizationId: string, contactId: string) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, organizationId), eq(contacts.id, contactId)))
    .limit(1);
  return contact ?? null;
}

export interface CreateContactInput {
  organizationId: string;
  actorUserId: string;
  name: string;
  phoneE164?: string | null;
  email?: string | null;
  notes?: string | null;
}

export async function createContact(input: CreateContactInput) {
  const [contact] = await db
    .insert(contacts)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      phoneE164: input.phoneE164 || null,
      email: input.email || null,
      notes: input.notes || null,
    })
    .returning();

  await recordActivity({
    organizationId: input.organizationId,
    type: "CONTACT_CREATED",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: contact.id,
  });

  return contact;
}

export interface UpdateContactInput {
  organizationId: string;
  actorUserId: string;
  contactId: string;
  name: string;
  phoneE164?: string | null;
  email?: string | null;
  notes?: string | null;
}

/**
 * Full replace of the editable fields (the UI always submits the whole
 * form) — returns null if the contact doesn't exist *in this organization*,
 * which is indistinguishable from "doesn't exist at all" on purpose.
 */
export async function updateContact(input: UpdateContactInput) {
  const [updated] = await db
    .update(contacts)
    .set({
      name: input.name,
      phoneE164: input.phoneE164 || null,
      email: input.email || null,
      notes: input.notes || null,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.id, input.contactId)))
    .returning();

  if (!updated) {
    return null;
  }

  await recordActivity({
    organizationId: input.organizationId,
    type: "CONTACT_UPDATED",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: updated.id,
  });

  return updated;
}
