export const THEME_COOKIE_NAME = "kindly_theme";

export type ThemePreference = "light" | "dark" | "system";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persists the theme choice from the browser. Deliberately not a Server
 * Action, same reasoning as `inbox/ficha-preference.ts`: setting a cookie
 * there would re-render the current page on the server on every toggle,
 * for a preference the client already applied instantly to `<html>` —
 * the cookie only has to be right by the *next* full load.
 */
export function saveThemePreference(value: ThemePreference): void {
  document.cookie = `${THEME_COOKIE_NAME}=${value}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
