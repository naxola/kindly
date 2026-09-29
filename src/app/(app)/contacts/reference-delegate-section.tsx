import { ReassignDelegateControl } from "@/app/(app)/contacts/reassign-delegate-control";

export interface ReferenceDelegateAssignment {
  id: string;
  delegateId: string;
  delegateName: string;
  /** A `Date` from a Server Component, an ISO string from JSON (the Inbox panel). */
  startedAt: Date | string;
  endedAt: Date | string | null;
}

/**
 * "Delegado de referencia" (PKG-014): who currently answers for this
 * Contact, plus their history. Shared by `contacts/[id]/page.tsx` (inside a
 * `Card`) and the Inbox panel's ficha (inside a plain `<section>`), so the
 * branching lives in one place.
 */
export function ReferenceDelegateSection({
  isAdmin,
  contactId,
  contactName,
  activeAssignment,
  history,
  delegates,
  onReassigned,
}: {
  isAdmin: boolean;
  contactId: string;
  contactName: string;
  activeAssignment: ReferenceDelegateAssignment | null;
  history: ReferenceDelegateAssignment[];
  delegates: { userId: string; name: string }[];
  onReassigned?: () => void;
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
            onReassigned={onReassigned}
          />
        ) : (
          <p className="type-body text-foreground-lighter">Todavía no tiene delegado asignado.</p>
        )
      ) : (
        <p className="type-body text-foreground">{activeAssignment ? activeAssignment.delegateName : "Sin asignar"}</p>
      )}

      {history.length > 1 && (
        <ul className="flex flex-col gap-1 border-t border-border pt-3 type-caption text-foreground-lighter">
          {history.map((assignment) => (
            <li key={assignment.id}>
              {assignment.delegateName}
              {" — "}
              {new Date(assignment.startedAt).toLocaleDateString("es-ES")}
              {assignment.endedAt ? ` a ${new Date(assignment.endedAt).toLocaleDateString("es-ES")}` : " (actual)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
