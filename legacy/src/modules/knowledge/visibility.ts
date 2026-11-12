import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

/**
 * SQL predicate for the **strict GLOBAL vs ORGANIZATION separation**
 * (`docs/PRODUCT.md` §11, `docs/DATABASE.md` §15, `CLAUDE.md` §2): an
 * organization sees GLOBAL (public) knowledge plus its own, never another
 * organization's private knowledge.
 *
 * Mirrors `contacts/visibility.ts`: a reusable predicate that takes the
 * relevant columns, so the same rule applies whether the caller is scanning
 * `knowledge_documents` or the denormalized `knowledge_chunks` (the hard
 * filter the retrieval layer of 7c runs *before* semantic ranking). Unlike
 * contacts there is no ADMIN/DELEGATE distinction — knowledge scope is per
 * organization, not per affiliate.
 */
export function knowledgeVisibilityCondition(
  organizationId: string,
  columns: { visibility: AnyPgColumn; organizationId: AnyPgColumn },
): SQL {
  return sql`(${columns.visibility} = 'GLOBAL' or ${columns.organizationId} = ${organizationId})`;
}
