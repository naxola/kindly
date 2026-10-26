import { ContextNav } from "@/components/shell/context-nav";
import { organizationNavItems } from "@/components/shell/organization-nav";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";

/**
 * `<lg` fallback (`docs/ui/LAYOUT_NAVIGATION.md` §4): on `lg+` the same
 * items render as the full-height `ProductMenu` column in
 * `organization/layout.tsx` instead, so this hides itself there. A server
 * component so the ADMIN-only items follow the caller's role.
 */
export async function OrganizationContextNav() {
  const member = await requireCurrentOrganizationMember();
  return <ContextNav label="Organización" items={organizationNavItems(member.role === "ADMIN")} className="lg:hidden" />;
}
