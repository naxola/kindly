"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
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
 * Header's account menu (docs/ui/LAYOUT_NAVIGATION.md §2): who you are and
 * signing out. Replaces the old standalone "Cerrar sesión" button.
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
        <DropdownMenuItem tone="destructive" onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
