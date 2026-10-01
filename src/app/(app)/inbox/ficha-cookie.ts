import "server-only";
import { cookies } from "next/headers";
import { FICHA_COOKIE_NAME } from "@/app/(app)/inbox/ficha-preference";

/**
 * Whether the conversation panel's ficha column renders collapsed (UI-10a,
 * `docs/ui/CONVERSATION_WORKSPACE.md` §2). Read on the server so the first
 * paint already has the right layout; written from the client
 * (`ficha-preference.ts`), not a Server Action — setting a cookie in a
 * Server Action makes Next re-render the whole current page on the server.
 */
export async function getFichaCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(FICHA_COOKIE_NAME)?.value === "1";
}
