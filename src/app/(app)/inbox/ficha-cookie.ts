import "server-only";
import { cookies } from "next/headers";

export const FICHA_COOKIE_NAME = "kindly_ficha";

/**
 * Whether the conversation panel's ficha column renders collapsed (UI-10a,
 * `docs/ui/CONVERSATION_WORKSPACE.md` §2 — only relevant at `xl`, where
 * chat + ficha don't comfortably fit together). Read on the server so the
 * first paint already has the right layout, same pattern as
 * `sidebar-cookie.ts`; the write side is `ficha-actions.ts`, a separate
 * "use server" file for the same reason that one is separate from
 * `sidebar-actions.ts`.
 */
export async function getFichaCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(FICHA_COOKIE_NAME)?.value === "1";
}
