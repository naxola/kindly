import { Briefcase, Contact, Inbox, ListChecks, Plug, Users } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Global sidebar navigation (docs/ui/LAYOUT_NAVIGATION.md §3).
 *
 * Flat for now: grouping Canales/Miembros under an "Organización" entry
 * waits for UI-7, when `/organization` exists to route to (UI-2 note in
 * docs/ui/ROADMAP.md). Labels and hrefs are exactly the top nav this
 * replaces — no page URL or E2E link name changes, only the frame.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/cases", label: "Cases", icon: Briefcase },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/channels", label: "Canales", icon: Plug },
  { href: "/members", label: "Miembros", icon: Users },
];

/** A nested route (`/contacts/123`) keeps its parent item active. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
