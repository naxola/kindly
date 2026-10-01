import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { AppShell } from "@/components/shell/app-shell";
import { QueryProvider } from "@/components/providers/query-provider";

/**
 * Authenticated shell (UI-2, docs/ui/LAYOUT_NAVIGATION.md). Stays a Server
 * Component so the auth/organization check runs before any client code —
 * `AppShell` is the only thing it hands the resolved member to.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    redirect("/login");
  }

  return (
    <QueryProvider>
      <AppShell member={member}>{children}</AppShell>
    </QueryProvider>
  );
}
