import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { OrganizationRole } from "@/modules/organizations/schema";

/**
 * Who is asking to see a Contact — the shape every visibility check needs,
 * a subset of `CurrentOrganizationMember` (`organizations/service.ts`) so
 * callers don't have to import that module just for this.
 */
export interface VisibilityMember {
  userId: string;
  role: OrganizationRole;
}

/**
 * SQL predicate: does `member` get to see the Contact referenced by
 * `contactIdColumn` (PKG-014, `docs/DECISIONS.md` — "Asignación de
 * afiliados" y "Delegado de referencia y acceso temporal")?
 *
 * `undefined` for an ADMIN: no filter, they see every Contact of the
 * organization. Combine with `and(...)` the same way every other optional
 * condition in this codebase does (`undefined` entries are dropped).
 *
 * For a DELEGATE, visible when either is true:
 *
 * 1. They are the Contact's current reference delegate
 *    (`contact_assignments`, `ended_at IS NULL`).
 * 2. **Acceso temporal**: the Contact's last message *to them* (any of
 *    their own `MessagingAccount`s, inbound only) is more recent than the
 *    last message — in *either* direction, including an echo from the
 *    reference delegate's own phone — between the Contact and its current
 *    reference delegate. A Contact with no reference delegate at all
 *    (never assigned — only reachable for a pre-PKG-014 Contact that never
 *    had a Conversation, since every Contact created after this migration
 *    gets an assignment at creation) falls back to "whoever it last wrote
 *    to can see it", via `coalesce(..., -infinity)`.
 *
 * Derived entirely from `messages`/`conversations`/`messaging_accounts` —
 * no extra state to keep in sync, so temporary access can never drift from
 * what actually happened on WhatsApp (`docs/DECISIONS.md`: "sin estado
 * adicional que pueda desincronizarse").
 *
 * Self-contained (its own `exists (select ... from contacts c ...)`, using
 * a local alias `c`) rather than assuming the caller already joined
 * `contacts` — so the same function works whether the caller is scanning
 * `contacts` itself, or `cases`/`tasks`/`conversations`, just by passing a
 * different `contactIdColumn`.
 */
export function contactVisibilityCondition(
  organizationId: string,
  member: VisibilityMember,
  contactIdColumn: AnyPgColumn,
): SQL | undefined {
  if (member.role === "ADMIN") {
    return undefined;
  }

  const delegateId = member.userId;

  return sql`exists (
    select 1 from contacts c
    where c.id = ${contactIdColumn}
      and c.organization_id = ${organizationId}
      and (
        exists (
          select 1 from contact_assignments ca
          where ca.contact_id = c.id
            and ca.delegate_id = ${delegateId}
            and ca.ended_at is null
        )
        or (
          select max(m.created_at)
          from messages m
          join conversations conv on conv.id = m.conversation_id
          join messaging_accounts ma on ma.id = conv.messaging_account_id
          where conv.contact_id = c.id
            and ma.delegate_id = ${delegateId}
            and m.direction = 'INBOUND'
        ) > coalesce(
          (
            select max(m2.created_at)
            from messages m2
            join conversations conv2 on conv2.id = m2.conversation_id
            join messaging_accounts ma2 on ma2.id = conv2.messaging_account_id
            join contact_assignments ref on ref.contact_id = c.id and ref.ended_at is null
            where conv2.contact_id = c.id
              and ma2.delegate_id = ref.delegate_id
          ),
          '-infinity'::timestamptz
        )
      )
  )`;
}
