"use server";

import { cookies } from "next/headers";
import { FICHA_COOKIE_NAME } from "@/app/(app)/inbox/ficha-cookie";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Persists the ficha column's collapsed state (UI-10a). Called from
 * `ConversationSheet`'s toggle button, which already updated its own state
 * optimistically — this only has to be right by the *next* full load, not
 * this one, so the caller does not await it on the interaction (same as
 * `setSidebarCollapsed`).
 */
export async function setFichaCollapsedAction(collapsed: boolean): Promise<void> {
  const store = await cookies();
  store.set(FICHA_COOKIE_NAME, collapsed ? "1" : "0", {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
}
