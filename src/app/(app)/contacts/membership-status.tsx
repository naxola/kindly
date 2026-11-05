import { firstUnpaidMonth, isFeeOverdue } from "@/modules/memberships/domain";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export interface MembershipStatusData {
  status: "ACTIVE" | "INACTIVE";
  memberNumber: string | null;
  /** A `Date` from a Server Component, an ISO string from JSON (the Inbox panel) — same convention as `ReferenceDelegateAssignment`. */
  startedAt: Date | string;
  endedAt: Date | string | null;
  /** ISO date (first of month), or `null` if never recorded. */
  feePaidUntil: string | null;
}

const monthYear = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Read-only render of a Contact's current `Membership` (UI-10b,
 * `docs/ui/CONVERSATION_WORKSPACE.md` §5.1) — shared by the editable form
 * on `/contacts/[id]` (`membership-section.tsx`) and the Inbox ficha
 * (`contact-ficha.tsx`, always read-only, same pattern as
 * `ReferenceDelegateSection`). The two amber notices ("cuota pendiente",
 * "buen momento para proponer la afiliación") are fixed rules
 * (`memberships/domain.ts`), never something the AI infers.
 */
export function MembershipStatus({ membership, boxed = false }: { membership: MembershipStatusData | null; boxed?: boolean }) {
  if (!membership) {
    return <p className="type-body text-foreground-lighter">Sin dar de alta.</p>;
  }

  const since = new Date(membership.startedAt).toLocaleDateString("es-ES");

  if (membership.status === "INACTIVE") {
    const until = membership.endedAt ? new Date(membership.endedAt).toLocaleDateString("es-ES") : "—";
    return (
      <div className={cn("flex flex-col gap-1", boxed && "rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5")}>
        <Badge tone="warning" dot>
          Afiliación dada de baja
        </Badge>
        <p className="type-body text-foreground-light">
          {membership.memberNumber ? `Nº ${membership.memberNumber} · ` : ""}de {since} a {until}
        </p>
        <p className="type-caption text-warning-soft-foreground">Buen momento para proponer que vuelva a afiliarse.</p>
      </div>
    );
  }

  const overdue = membership.feePaidUntil ? isFeeOverdue({ status: membership.status, feePaidUntil: membership.feePaidUntil }) : false;

  return (
    <div className={cn("flex flex-col gap-1", boxed && "rounded-lg border border-primary-border bg-primary-soft px-3 py-2.5")}>
      <Badge tone="success" dot>
        Afiliación activa
      </Badge>
      <p className="type-body text-foreground-light">
        {membership.memberNumber ? `Nº ${membership.memberNumber} · ` : ""}desde el {since}
      </p>
      {membership.feePaidUntil && !overdue && (
        <p className="type-caption text-foreground-lighter">Cuota pagada hasta {monthYear(membership.feePaidUntil)}</p>
      )}
      {overdue && (
        <p className="type-caption text-warning-soft-foreground">
          Cuota de {monthYear(firstUnpaidMonth(membership.feePaidUntil!).toISOString())} pendiente.
        </p>
      )}
    </div>
  );
}
