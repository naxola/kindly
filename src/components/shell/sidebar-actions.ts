"use server";

import { cookies } from "next/headers";
import { SIDEBAR_COOKIE_NAME } from "@/components/shell/sidebar-cookie";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persists the sidebar's collapsed state (docs/ui/LAYOUT_NAVIGATION.md §3).
 * Called from `AppSidebar`'s toggle button, which already updated its own
 * state optimistically — this only has to be right by the *next* full
 * load, not this one, so the caller does not await it on the interaction.
 */
export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  const store = await cookies();
  store.set(SIDEBAR_COOKIE_NAME, collapsed ? "1" : "0", {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}
