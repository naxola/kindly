import "server-only";
import { cookies } from "next/headers";

export const SIDEBAR_COOKIE_NAME = "kindly_sidebar";

/**
 * Whether the sidebar renders collapsed (docs/ui/LAYOUT_NAVIGATION.md §3).
 * Read on the server so the first paint already has the right width — no
 * client-side flash after hydration. Server Components only; the write
 * side is `sidebar-actions.ts` (a separate "use server" file, since a
 * Server Action file exposes every export to the client as a callable RPC
 * and a cookie read has no business being one).
 */
export async function getSidebarCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(SIDEBAR_COOKIE_NAME)?.value === "1";
}
