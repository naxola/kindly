import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOrganizationMember } from "@/modules/organizations/service";
import { SignOutButton } from "@/app/(app)/sign-out-button";

/**
 * Shared authenticated shell for PKG-002: Dashboard/Contacts/Cases/Tasks.
 * Minimal nav, no design system yet (same level as the login page from
 * PKG-001) — real product UI is a future package.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const member = await getCurrentOrganizationMember();
  if (!member) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/dashboard" className="font-semibold">
            Kindly
          </Link>
          <Link href="/contacts">Contacts</Link>
          <Link href="/cases">Cases</Link>
          <Link href="/tasks">Tasks</Link>
        </nav>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>
            {member.organizationName} · {member.role}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
