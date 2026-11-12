/**
 * Browser tab title, most-specific first (docs/ui/LAYOUT_NAVIGATION.md §6):
 * `Entidad · Módulo · Organización · Kindly`. Omits any part left out
 * (a list page has no entity; a page reached before login has no
 * organization), so the join never produces a stray "· ·".
 */
export function pageTitle(...parts: Array<string | null | undefined>): string {
  return [...parts.filter((part): part is string => Boolean(part && part.trim())), "Kindly"].join(" · ");
}
