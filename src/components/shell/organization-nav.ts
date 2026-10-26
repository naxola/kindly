import type { ContextNavItem } from "@/components/shell/context-nav";

/**
 * The `/organization` module's second-level navigation (UI-7,
 * `docs/ui/LAYOUT_NAVIGATION.md` §4): shared between the `lg+` `ProductMenu`
 * column (`organization/layout.tsx`) and the `<lg` horizontal `ContextNav`
 * each page renders under its own `PageHeader`
 * (`organization/organization-context-nav.tsx`) — one list, two renderings.
 */
export const ORGANIZATION_NAV_ITEMS: ContextNavItem[] = [
  { href: "/organization", label: "General" },
  { href: "/organization/members", label: "Miembros" },
  { href: "/organization/channels", label: "Canales" },
];

/** Integraciones only exists for an ADMIN (it holds the keys that write into the organization). */
const ADMIN_ONLY_ITEM: ContextNavItem = { href: "/organization/integrations", label: "Integraciones" };

export function organizationNavItems(isAdmin: boolean): ContextNavItem[] {
  return isAdmin ? [...ORGANIZATION_NAV_ITEMS, ADMIN_ONLY_ITEM] : ORGANIZATION_NAV_ITEMS;
}
