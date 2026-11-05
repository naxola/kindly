import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { recordActivity } from "@/modules/audit/service";
import { users } from "@/modules/auth/schema";
import { contactAssignments, contacts } from "@/modules/contacts/schema";
import { buildWelcomeEmail } from "@/modules/contacts/welcome-email";
import { sendEmail } from "@/modules/email/sender";
import { organizationMembers, organizations } from "@/modules/organizations/schema";

export type WelcomeEmailResult =
  | { status: "SENT" }
  | { status: "SKIPPED"; reason: "CONTACT_NOT_FOUND" | "NO_EMAIL" | "NO_DELEGATE" | "ALREADY_SENT" };

/**
 * Sends the welcome email that introduces a Contact's current reference
 * delegate (name, email and phone), and stamps the active assignment so it
 * is not sent twice by accident. A human-triggered, human-authored template
 * — never AI output (`CLAUDE.md` sección 2).
 *
 * `force` re-sends even if already sent (the explicit "Reenviar" button).
 *
 * Throws when the email provider fails; the stamp is only written after a
 * successful send, so a failure can simply be retried.
 */
export async function sendContactWelcomeEmail(input: {
  organizationId: string;
  actorUserId: string;
  contactId: string;
  force?: boolean;
}): Promise<WelcomeEmailResult> {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, input.organizationId), eq(contacts.id, input.contactId)))
    .limit(1);
  if (!contact) {
    return { status: "SKIPPED", reason: "CONTACT_NOT_FOUND" };
  }
  if (!contact.email) {
    return { status: "SKIPPED", reason: "NO_EMAIL" };
  }

  const [row] = await db
    .select({
      assignmentId: contactAssignments.id,
      welcomeSentAt: contactAssignments.welcomeSentAt,
      delegateId: contactAssignments.delegateId,
      delegateName: users.name,
      delegateEmail: users.email,
      delegatePhone: organizationMembers.phoneE164,
      organizationName: organizations.name,
    })
    .from(contactAssignments)
    .innerJoin(users, eq(users.id, contactAssignments.delegateId))
    .innerJoin(organizations, eq(organizations.id, contactAssignments.organizationId))
    .leftJoin(
      organizationMembers,
      and(
        eq(organizationMembers.organizationId, contactAssignments.organizationId),
        eq(organizationMembers.userId, contactAssignments.delegateId),
      ),
    )
    .where(
      and(
        eq(contactAssignments.organizationId, input.organizationId),
        eq(contactAssignments.contactId, input.contactId),
        isNull(contactAssignments.endedAt),
      ),
    )
    .limit(1);
  if (!row) {
    return { status: "SKIPPED", reason: "NO_DELEGATE" };
  }
  if (row.welcomeSentAt && !input.force) {
    return { status: "SKIPPED", reason: "ALREADY_SENT" };
  }

  await sendEmail(
    buildWelcomeEmail({
      to: contact.email,
      contactName: contact.name,
      organizationName: row.organizationName,
      delegate: { name: row.delegateName, email: row.delegateEmail, phoneE164: row.delegatePhone },
    }),
  );

  await db
    .update(contactAssignments)
    .set({ welcomeSentAt: new Date() })
    .where(eq(contactAssignments.id, row.assignmentId));

  await recordActivity({
    organizationId: input.organizationId,
    type: "CONTACT_WELCOME_SENT",
    actorUserId: input.actorUserId,
    entityType: "contact",
    entityId: input.contactId,
    metadata: { delegateId: row.delegateId },
  });

  return { status: "SENT" };
}

/** Human-readable explanation for a skipped welcome email. */
export function describeSkippedWelcome(reason: Extract<WelcomeEmailResult, { status: "SKIPPED" }>["reason"]): string {
  switch (reason) {
    case "NO_EMAIL":
      return "El afiliado no tiene email.";
    case "NO_DELEGATE":
      return "El afiliado no tiene delegado asignado.";
    case "ALREADY_SENT":
      return "El email de bienvenida ya se envió a este delegado.";
    case "CONTACT_NOT_FOUND":
      return "Contacto no encontrado.";
  }
}
