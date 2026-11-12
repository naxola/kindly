export const FICHA_COOKIE_NAME = "kindly_ficha";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persists the ficha column's collapsed state from the browser. Deliberately
 * not a Server Action: setting a cookie there makes Next re-render the
 * current page on the server (the whole Inbox, list queries included) on
 * every toggle — for a preference that only has to be right by the next
 * full load, since the panel already updated its own state.
 */
export function saveFichaCollapsed(collapsed: boolean): void {
  document.cookie = `${FICHA_COOKIE_NAME}=${collapsed ? "1" : "0"}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
