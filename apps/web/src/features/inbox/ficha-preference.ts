/**
 * Whether the conversation panel shows the contact's ficha is remembered per browser, in a cookie
 * the server reads so the first paint already has the right layout (no flash). It is written from
 * the browser, not from a server action: setting a cookie in one would re-render the whole page.
 */
export const FICHA_COOKIE = 'kindly_ficha'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function saveFichaCollapsed(collapsed: boolean): void {
  document.cookie = `${FICHA_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`
}
