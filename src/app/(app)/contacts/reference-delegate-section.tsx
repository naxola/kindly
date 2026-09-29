import type { ContactAssignment } from "@/modules/contacts/assignments";
import { ReassignDelegateControl } from "@/app/(app)/contacts/reassign-delegate-control";

/**
 * "Delegado de referencia" (PKG-014): who currently answers for this
 * Contact, plus their history. Extracted from `contacts/[id]/page.tsx` so
 * the conversation ficha (UI-10a) can show the same content without a
 * second copy of the branching logic — callers provide their own wrapper
 * (a `Card` on the full contact page, a plain `<section>` in the ficha).
 */
export function ReferenceDelegateSection({
  isAdmin,
  contactId,
  contactName,
  activeAssignment,
  history,
  delegates,
  nameById,
}: {
  isAdmin: boolean;
  contactId: string;
  contactName: string;
  activeAssignment: ContactAssignment | null;
  history: ContactAssignment[];
  delegates: { userId: string; name: string }[];
  nameById: Map<string, string>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {isAdmin ? (
        activeAssignment ? (
          <ReassignDelegateControl
            contactId={contactId}
            contactName={contactName}
            currentDelegateId={activeAssignment.delegateId}
            delegates={delegates}
          />
        ) : (
          <p className="type-body text-foreground-lighter">Todavía no tiene delegado asignado.</p>
        )
      ) : (
        <p className="type-body text-foreground">
          {activeAssignment ? (nameById.get(activeAssignment.delegateId) ?? "—") : "Sin asignar"}
        </p>
      )}

      {history.length > 1 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-3 type-caption text-foreground-lighter">
          {history.map((assignment) => (
            <li key={assignment.id}>
              {nameById.get(assignment.delegateId) ?? assignment.delegateId}
              {" — "}
              {assignment.startedAt.toLocaleDateString("es-ES")}
              {assignment.endedAt ? ` a ${assignment.endedAt.toLocaleDateString("es-ES")}` : " (actual)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
