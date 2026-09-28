"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plug } from "lucide-react";
import { authClient } from "@/modules/auth/auth-client";
import { Avatar } from "@/components/ui/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Header's account menu (docs/ui/LAYOUT_NAVIGATION.md §2): who you are,
 * "Mis canales" (a shortcut to `/organization/channels` now that Canales is
 * no longer its own sidebar item — UI-2 had dropped this as redundant with
 * that item, which UI-7 removed), and signing out.
 */
export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-control px-1.5 py-1 type-label text-foreground hover:bg-state-hover focus-ring"
        >
          <Avatar name={name} size="sm" />
          <span className="hidden max-w-32 truncate sm:inline">{name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="type-label text-foreground">{name}</span>
          <span className="type-caption text-foreground-lighter">{email}</span>
          <span className="type-caption text-foreground-lighter">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/organization/channels">
            <Plug aria-hidden />
            Mis canales
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="destructive" onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
