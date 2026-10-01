import type { ReactNode } from "react";
import { ProductMenu } from "@/components/shell/product-menu";
import { ORGANIZATION_NAV_ITEMS } from "@/components/shell/organization-nav";

/**
 * `/organization` module shell (UI-7): the `ProductMenu` full-height column
 * reserved for it since UI-5 (`docs/ui/LAYOUT_NAVIGATION.md` §4), `lg+`
 * only. Below `lg`, each page renders `OrganizationContextNav` itself, right
 * under its own `PageHeader` — the layout has no header of its own to put
 * it under.
 */
export default function OrganizationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-1">
      <ProductMenu title="Organización" label="Organización" groups={[{ items: ORGANIZATION_NAV_ITEMS }]} />
      <div className="h-full min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
