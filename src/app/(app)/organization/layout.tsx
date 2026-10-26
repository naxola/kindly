import type { ReactNode } from "react";
import { ProductMenu } from "@/components/shell/product-menu";
import { organizationNavItems } from "@/components/shell/organization-nav";
import { requireCurrentOrganizationMember } from "@/modules/organizations/service";

/**
 * `/organization` module shell (UI-7): the `ProductMenu` full-height column
 * reserved for it since UI-5 (`docs/ui/LAYOUT_NAVIGATION.md` §4), `lg+`
 * only. Below `lg`, each page renders `OrganizationContextNav` itself, right
 * under its own `PageHeader` — the layout has no header of its own to put
 * it under.
 */
export default async function OrganizationLayout({ children }: { children: ReactNode }) {
  const member = await requireCurrentOrganizationMember();
  return (
    <div className="flex h-full min-w-0 flex-1">
      <ProductMenu title="Organización" label="Organización" groups={[{ items: organizationNavItems(member.role === "ADMIN") }]} />
      <div className="h-full min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
