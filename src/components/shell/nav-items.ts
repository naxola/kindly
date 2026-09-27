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
 * docs/ui/ROADMAP.md). Hrefs are exactly the top nav this replaces — no
 * page URL changes, only the frame. Labels are Spanish (UI-4: Contacts →
 * Contactos, Cases → Casos, Tasks → Tareas, alongside the pages
 * themselves) except "Inbox", kept as the product's own name for the
 * module (docs/ui/PRINCIPLES.md §5).
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contactos", icon: Contact },
  { href: "/cases", label: "Casos", icon: Briefcase },
  { href: "/tasks", label: "Tareas", icon: ListChecks },
  { href: "/channels", label: "Canales", icon: Plug },
  { href: "/members", label: "Miembros", icon: Users },
];

/** A nested route (`/contacts/123`) keeps its parent item active. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
