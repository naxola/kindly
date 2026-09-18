import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { cases, caseStatus } from "@/modules/cases/schema";
import { getContact } from "@/modules/contacts/service";
import { isOrganizationMember } from "@/modules/organizations/service";
import { recordActivity } from "@/modules/audit/service";

export async function listCases(organizationId: string) {
  return db
    .select()
    .from(cases)
    .where(eq(cases.organizationId, organizationId))
    .orderBy(desc(cases.createdAt));
}

export async function getCase(organizationId: string, caseId: string) {
  const [row] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.organizationId, organizationId), eq(cases.id, caseId)))
    .limit(1);
  return row ?? null;
}

export interface CreateCaseInput {
  organizationId: string;
  actorUserId: string;
  contactId: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  assignedTo?: string | null;
}

export async function createCase(input: CreateCaseInput) {
  // The Contact must belong to the same organization — without this check,
  // guessing another organization's contact id would let a Case reference
  // it (docs/PRODUCT.md: un Contact puede tener varios Case, but only
  // within its own organization).
  const contact = await getContact(input.organizationId, input.contactId);
  if (!contact) {
    throw new Error("Contact not found in this organization.");
  }

  if (input.assignedTo && !(await isOrganizationMember(input.organizationId, input.assignedTo))) {
    throw new Error("Cannot assign a case to a user outside the organization.");
  }

  const [createdCase] = await db
    .insert(cases)
    .values({
      organizationId: input.organizationId,
      contactId: input.contactId,
      title: input.title,
      description: input.description || null,
      priority: input.priority || null,
      assignedTo: input.assignedTo || null,
    })
    .returning();

  await recordActivity({
    organizationId: input.organizationId,
    type: "CASE_CREATED",
    actorUserId: input.actorUserId,
    entityType: "case",
    entityId: createdCase.id,
  });

  if (input.assignedTo) {
    await recordActivity({
      organizationId: input.organizationId,
      type: "CASE_ASSIGNED",
      actorUserId: input.actorUserId,
      entityType: "case",
      entityId: createdCase.id,
      metadata: { assignedTo: input.assignedTo },
    });
  }

  return createdCase;
}

export interface UpdateCaseInput {
  organizationId: string;
  actorUserId: string;
  caseId: string;
  title: string;
  description?: string | null;
  status: (typeof caseStatus.enumValues)[number];
  priority?: string | null;
  assignedTo?: string | null;
}

export async function updateCase(input: UpdateCaseInput) {
  const existing = await getCase(input.organizationId, input.caseId);
  if (!existing) {
    return null;
  }

  if (input.assignedTo && !(await isOrganizationMember(input.organizationId, input.assignedTo))) {
    throw new Error("Cannot assign a case to a user outside the organization.");
  }

  const statusChanged = existing.status !== input.status;
  const assignmentChanged = existing.assignedTo !== (input.assignedTo || null);
  const closedAt = input.status === "CLOSED" || input.status === "RESOLVED" ? new Date() : null;

  const [updated] = await db
    .update(cases)
    .set({
      title: input.title,
      description: input.description || null,
      status: input.status,
      priority: input.priority || null,
      assignedTo: input.assignedTo || null,
      closedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(cases.organizationId, input.organizationId), eq(cases.id, input.caseId)))
    .returning();

  if (!updated) {
    return null;
  }

  if (statusChanged) {
    await recordActivity({
      organizationId: input.organizationId,
      type: "CASE_STATUS_CHANGED",
      actorUserId: input.actorUserId,
      entityType: "case",
      entityId: updated.id,
      metadata: { from: existing.status, to: input.status },
    });
  }

  if (assignmentChanged && input.assignedTo) {
    await recordActivity({
      organizationId: input.organizationId,
      type: "CASE_ASSIGNED",
      actorUserId: input.actorUserId,
      entityType: "case",
      entityId: updated.id,
      metadata: { assignedTo: input.assignedTo },
    });
  }

  return updated;
}
