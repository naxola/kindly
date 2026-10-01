import { BookOpen, Briefcase, Building2, Contact, Inbox, ListChecks } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Global sidebar navigation (docs/ui/LAYOUT_NAVIGATION.md §3). Hrefs are
 * exactly the top nav this replaces — no page URL changes, only the frame.
 * Labels are Spanish (UI-4: Contacts → Contactos, Cases → Casos, Tasks →
 * Tareas, alongside the pages themselves) except "Inbox", kept as the
 * product's own name for the module (docs/ui/PRINCIPLES.md §5).
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", label: "Conversaciones", icon: Inbox },
  { href: "/contacts", label: "Contactos", icon: Contact },
  { href: "/cases", label: "Casos", icon: Briefcase },
  { href: "/tasks", label: "Tareas", icon: ListChecks },
  { href: "/knowledge", label: "Conocimiento", icon: BookOpen },
];

/**
 * Canales/Miembros no longer have their own sidebar item (UI-7): both moved
 * under `/organization/*`, which this single item routes to instead. Kept
 * separate from `NAV_ITEMS` rather than appended to it because it renders
 * after a separator (docs/ui/LAYOUT_NAVIGATION.md §3), not as one more item
 * in the same group.
 */
export const ORGANIZATION_NAV_ITEM: NavItem = { href: "/organization", label: "Organización", icon: Building2 };

/** A nested route (`/contacts/123`) keeps its parent item active. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
