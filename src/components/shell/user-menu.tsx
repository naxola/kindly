"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Plug } from "lucide-react";
import { authClient } from "@/modules/auth/auth-client";
import { saveThemePreference, type ThemePreference } from "@/components/shell/theme-preference";
import { Avatar } from "@/components/ui/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Claro",
  dark: "Oscuro",
  system: "Sistema",
};

/**
 * Header's account menu (docs/ui/LAYOUT_NAVIGATION.md §2): who you are,
 * "Mis canales" (a shortcut to `/organization/channels` now that Canales is
 * no longer its own sidebar item — UI-2 had dropped this as redundant with
 * that item, which UI-7 removed), signing out, and the theme selector
 * (UI-8, `docs/ui/ROADMAP.md` "Fase 8" — Claro/Oscuro/Sistema, aprobado
 * 2026-09-26). `initialTheme` comes from the server-read cookie
 * (`theme-cookie.ts`) via `AppShell` → `AppHeader`, so the menu shows the
 * right selection immediately; picking a new one applies it to `<html>`
 * instantly (no `router.refresh()` — the whole point of not using a
 * Server Action here, see `theme-preference.ts`) and only writes the
 * cookie for the *next* full load.
 */
export function UserMenu({
  name,
  email,
  role,
  initialTheme,
}: {
  name: string;
  email: string;
  role: string;
  initialTheme: ThemePreference;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<ThemePreference>(initialTheme);

  function selectTheme(value: string) {
    const next = value as ThemePreference;
    setTheme(next);
    saveThemePreference(next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
  }

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
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuRadioGroup aria-label="Tema" value={theme} onValueChange={selectTheme}>
          {(["light", "dark", "system"] as const).map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {THEME_LABELS[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="destructive" onSelect={() => void signOut()}>
          <LogOut aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
