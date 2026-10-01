import "server-only";
import { cookies } from "next/headers";
import { THEME_COOKIE_NAME, type ThemePreference } from "@/components/shell/theme-preference";

/**
 * Which theme to paint the very first server-rendered HTML with (UI-8,
 * docs/ui/ROADMAP.md "Fase 8" — tema oscuro, aprobado 2026-09-26). Read in
 * `src/app/layout.tsx`, shared by the public site and the app, so a
 * "Sistema" default never overrides an explicit choice regardless of which
 * side of the app someone lands on. `"system"` is the default for any
 * missing/invalid cookie value — it needs no CSS block of its own (see
 * `tokens.css`), so nothing more to validate. Written from the client
 * (`theme-preference.ts`), not a Server Action — same reasoning as
 * `ficha-cookie.ts`/`ficha-preference.ts`.
 */
export async function getThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE_NAME)?.value;
  return value === "light" || value === "dark" ? value : "system";
}
