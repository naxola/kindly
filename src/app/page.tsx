import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/modules/auth/auth";

/**
 * Root route. PKG-001 has no product UI yet (Inbox, etc. come later) — this
 * only proves the auth flow end-to-end by sending the visitor to the right
 * place.
 */
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  redirect(session ? "/dashboard" : "/login");
}
