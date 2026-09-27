/**
 * The anchored conversation panel (docs/ui/CHAT.md §4) asks the sidebar to
 * collapse temporarily when there isn't room for the sidebar, the
 * ContextNav column, the list and a 560px panel side by side — a plain
 * `window` event instead of React Context, since the sidebar lives in
 * `AppShell` (above the route tree) and the panel several route segments
 * below it, with no server-renderable component in between to thread a
 * provider through.
 *
 * This never touches the user's own collapsed preference (the cookie
 * `AppSidebar` persists from its toggle button): it is a temporary
 * override, active only while a conversation is anchored, and must not
 * survive a reload as if the user had chosen it.
 */
export const CHAT_ANCHORED_EVENT = "kindly:chat-anchored";

export function setChatAnchored(anchored: boolean) {
  window.dispatchEvent(new CustomEvent<boolean>(CHAT_ANCHORED_EVENT, { detail: anchored }));
}
