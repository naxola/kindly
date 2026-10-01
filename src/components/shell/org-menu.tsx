"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * Its own copy of the three destinations, worded for a menu ("Ajustes de la
 * organización") rather than for `ContextNav`'s short tab label ("General")
 * — `ORGANIZATION_NAV_ITEMS` (`components/shell/organization-nav.ts`) is not
 * reused here on purpose.
 */
const ORGANIZATION_MENU_ITEMS = [
  { href: "/organization", label: "Ajustes de la organización" },
  { href: "/organization/members", label: "Miembros" },
  { href: "/organization/channels", label: "Canales" },
];

/**
 * Header breadcrumb (`docs/ui/LAYOUT_NAVIGATION.md` §2): "the organization
 * name is plain text, not yet the dropdown" was the UI-2 decision, deferred
 * until `/organization` existed. It does now (UI-7).
 */
export function OrgMenu({ organizationName }: { organizationName: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden items-center gap-1 truncate rounded-control px-1.5 py-1 type-caption text-foreground-lighter hover:bg-state-hover hover:text-foreground focus-ring sm:flex"
        >
          <span className="max-w-40 truncate">{organizationName}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {ORGANIZATION_MENU_ITEMS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
