"use client";

import { ContextNav } from "@/components/shell/context-nav";
import { ORGANIZATION_NAV_ITEMS } from "@/components/shell/organization-nav";

/**
 * `<lg` fallback (`docs/ui/LAYOUT_NAVIGATION.md` §4): on `lg+` the same
 * items render as the full-height `ProductMenu` column in
 * `organization/layout.tsx` instead, so this hides itself there.
 */
export function OrganizationContextNav() {
  return <ContextNav label="Organización" items={ORGANIZATION_NAV_ITEMS} className="lg:hidden" />;
}
